(function () {
  'use strict';

  L.Routing = L.Routing || {};

  /**
   * Straight-line ("as the crow flies") router for Leaflet Routing Machine.
   * Connects waypoints with direct line segments — no road network required.
   * Ideal for ski touring and off-trail navigation.
   */
  L.Routing.StraightLine = L.Class.extend({

    options: {
      // Open-Meteo elevation API (no key required)
      elevationApiBaseUrl: 'https://api.open-meteo.com/v1/elevation',
      elevationChunkSize: 100,
    },

    initialize: function (options) {
      L.setOptions(this, options);
      this._elevationCache = {};
    },

    _coordKey: function (coord) {
      return coord.lat.toFixed(5) + ',' + coord.lng.toFixed(5);
    },

    _fetchChunkElevations: function (chunk, attempt) {
      var latitudes = chunk.map(function (c) { return c.lat.toFixed(6); }).join(',');
      var longitudes = chunk.map(function (c) { return c.lng.toFixed(6); }).join(',');
      var url = this.options.elevationApiBaseUrl + '?latitude=' + latitudes + '&longitude=' + longitudes;

      return fetch(url)
        .then(function (res) {
          if (!res.ok) {
            throw new Error('elevation-http-' + res.status);
          }
          return res.json();
        })
        .then(function (data) {
          if (data && Array.isArray(data.elevation) && data.elevation.length === chunk.length) {
            return data.elevation;
          }
          throw new Error('invalid-elevation-payload');
        })
        .catch(L.bind(function () {
          if (attempt < 2) {
            return new Promise(function (resolve) {
              setTimeout(resolve, 250 * (attempt + 1));
            }).then(L.bind(function () {
              return this._fetchChunkElevations(chunk, attempt + 1);
            }, this));
          }
          return chunk.map(function () { return 0; });
        }, this));
    },

    _buildResult: function (coords, validWaypoints, waypointIndices, totalDistance, elevations) {
      var stats = this._computeElevationStats(elevations);

      return [{
        name: 'Straight line',
        summary: {
          totalDistance: totalDistance,
          totalTime: 0,
        },
        PositiveElevation: stats.PositiveElevation,
        NegativeElevation: stats.NegativeElevation,
        maxLenElevation: stats.maxLenElevation,
        minLenElevation: stats.minLenElevation,
        topElevation: stats.topElevation,
        elevation: stats.elevation,
        coordinates: coords,
        waypointIndices: waypointIndices,
        elevations: elevations,
        inputWaypoints: validWaypoints,
        waypoints: validWaypoints,
        instructions: [],
      }];
    },

    _computeElevationStats: function (elevations) {
      if (!elevations || elevations.length === 0) {
        return {
          PositiveElevation: '0',
          NegativeElevation: '0',
          maxLenElevation: '0',
          minLenElevation: '0',
          topElevation: '0',
          elevation: '0',
        };
      }

      var totalPositiveElevation = 0;
      var totalNegativeElevation = 0;
      var maxContinuousGain = 0;
      var maxContinuousLoss = 0;
      var currentGain = 0;
      var currentLoss = 0;

      for (var i = 1; i < elevations.length; i++) {
        var diff = elevations[i] - elevations[i - 1];

        if (diff > 0) {
          totalPositiveElevation += diff;
          currentGain += diff;
          currentLoss = 0;
          if (currentGain > maxContinuousGain) maxContinuousGain = currentGain;
        } else if (diff < 0) {
          totalNegativeElevation += -diff;
          currentLoss += -diff;
          currentGain = 0;
          if (currentLoss > maxContinuousLoss) maxContinuousLoss = currentLoss;
        }
      }

      var minElevation = Math.min.apply(null, elevations);
      var maxElevation = Math.max.apply(null, elevations);

      return {
        PositiveElevation: totalPositiveElevation.toFixed(0),
        NegativeElevation: totalNegativeElevation.toFixed(0),
        maxLenElevation: maxContinuousGain.toFixed(0),
        minLenElevation: maxContinuousLoss.toFixed(0),
        topElevation: (maxElevation - minElevation).toFixed(0),
        elevation: (elevations[elevations.length - 1] - elevations[0]).toFixed(0),
      };
    },

    _normalizeElevations: function (values, expectedLength) {
      var out = [];
      for (var i = 0; i < expectedLength; i++) {
        var v = Number(values[i]);
        if (!isFinite(v)) {
          v = out.length > 0 ? out[out.length - 1] : 0;
        }
        out.push(v);
      }
      return out;
    },

    _fetchElevations: function (coords, done) {
      if (!coords || coords.length === 0 || typeof fetch !== 'function') {
        done(coords.map(function () { return 0; }));
        return;
      }

      var chunkSize = this.options.elevationChunkSize;
      var cached = new Array(coords.length);
      var missingIndices = [];

      for (var idx = 0; idx < coords.length; idx++) {
        var key = this._coordKey(coords[idx]);
        if (this._elevationCache.hasOwnProperty(key)) {
          cached[idx] = this._elevationCache[key];
        } else {
          missingIndices.push(idx);
        }
      }

      if (missingIndices.length === 0) {
        done(cached);
        return;
      }

      var requests = [];
      var chunks = [];

      for (var m = 0; m < missingIndices.length; m += chunkSize) {
        var indexChunk = missingIndices.slice(m, m + chunkSize);
        var coordChunk = indexChunk.map(function (i) { return coords[i]; });
        chunks.push({ indices: indexChunk, coords: coordChunk });
      }

      for (var c = 0; c < chunks.length; c++) {
        requests.push(this._fetchChunkElevations(chunks[c].coords, 0));
      }

      Promise.all(requests)
        .then(L.bind(function (parts) {
          for (var p = 0; p < parts.length; p++) {
            var elevations = parts[p];
            var chunk = chunks[p];

            for (var e = 0; e < chunk.indices.length; e++) {
              var pointIndex = chunk.indices[e];
              var value = Number(elevations[e]);
              if (!isFinite(value)) value = 0;
              cached[pointIndex] = value;
              this._elevationCache[this._coordKey(coords[pointIndex])] = value;
            }
          }

          done(cached);
        }, this))
        .catch(function () {
          done(cached.map(function (v) { return isFinite(v) ? v : 0; }));
        });
    },

    route: function (waypoints, callback, context) {
      var coords = [];
      var waypointIndices = [];
      var totalDistance = 0;

      var validWaypoints = waypoints.filter(function (wp) {
        return wp && wp.latLng;
      });

      for (var i = 0; i < validWaypoints.length; i++) {
        var current = validWaypoints[i].latLng;

        if (i === 0) {
          coords.push(current);
          waypointIndices.push(0);
          continue;
        }

        var previous = validWaypoints[i - 1].latLng;
        var segmentDistance = previous.distanceTo(current);
        totalDistance += segmentDistance;

        // Densify segments so route dragging can insert waypoints between
        // existing waypoints (LRM relies on nearest route vertex index).
        var steps = Math.max(1, Math.ceil(segmentDistance / 100));
        for (var step = 1; step <= steps; step++) {
          var t = step / steps;
          coords.push(L.latLng(
            previous.lat + (current.lat - previous.lat) * t,
            previous.lng + (current.lng - previous.lng) * t
          ));
        }

        waypointIndices.push(coords.length - 1);
      }

      this._fetchElevations(coords, L.bind(function (rawElevations) {
        var elevations = this._normalizeElevations(rawElevations, coords.length);
        var result = this._buildResult(
          coords,
          validWaypoints,
          waypointIndices,
          totalDistance,
          elevations
        );

        if (context) {
          callback.call(context, null, result);
        } else {
          callback(null, result);
        }
      }, this));
    },

  });

  L.Routing.straightLine = function () {
    return new L.Routing.StraightLine();
  };

})();
