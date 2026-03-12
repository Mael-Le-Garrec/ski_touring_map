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
      elevationChunkDelayMs: 350,
      elevationRetryDelayMs: 1200,
      elevationRateLimitCooldownMs: 15000,
      elevationSampleDistance: 100,
      elevationMaxSamples: 80,
    },

    initialize: function (options) {
      L.setOptions(this, options);
      this._elevationCache = {};
      this._pendingElevationRequests = {};
      this._routeRequestId = 0;
      this._rateLimitedUntil = 0;
    },

    _coordKey: function (coord) {
      return coord.lat.toFixed(5) + ',' + coord.lng.toFixed(5);
    },

    _chunkKey: function (chunk) {
      return chunk.map(L.bind(function (coord) {
        return this._coordKey(coord);
      }, this)).join('|');
    },

    _delay: function (ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    },

    _parseRetryAfterMs: function (headerValue) {
      if (!headerValue) return null;

      var seconds = Number(headerValue);
      if (isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }

      var dateMs = Date.parse(headerValue);
      if (!isNaN(dateMs)) {
        return Math.max(0, dateMs - Date.now());
      }

      return null;
    },

    _buildRateLimitError: function (retryAfterMs) {
      return {
        code: 'rate-limited',
        retryAfterMs: retryAfterMs,
      };
    },

    _fetchChunkElevations: function (chunk, attempt) {
      var chunkKey = this._chunkKey(chunk);
      if (this._pendingElevationRequests[chunkKey]) {
        return this._pendingElevationRequests[chunkKey];
      }

      if (Date.now() < this._rateLimitedUntil) {
        return Promise.reject(this._buildRateLimitError(this._rateLimitedUntil - Date.now()));
      }

      var latitudes = chunk.map(function (c) { return c.lat.toFixed(6); }).join(',');
      var longitudes = chunk.map(function (c) { return c.lng.toFixed(6); }).join(',');
      var url = this.options.elevationApiBaseUrl + '?latitude=' + latitudes + '&longitude=' + longitudes;

      var request = fetch(url)
        .then(L.bind(function (res) {
          if (res.status === 429) {
            var retryAfterMs = this._parseRetryAfterMs(res.headers.get('Retry-After')) || this.options.elevationRateLimitCooldownMs;
            this._rateLimitedUntil = Date.now() + retryAfterMs;
            throw this._buildRateLimitError(retryAfterMs);
          }
          if (!res.ok) {
            throw new Error('elevation-http-' + res.status);
          }
          return res.json();
        }, this))
        .then(function (data) {
          if (data && Array.isArray(data.elevation) && data.elevation.length === chunk.length) {
            return data.elevation;
          }
          throw new Error('invalid-elevation-payload');
        })
        .catch(L.bind(function (error) {
          if (error && error.code === 'rate-limited') {
            delete this._pendingElevationRequests[chunkKey];
            throw error;
          }

          if (attempt < 2) {
            delete this._pendingElevationRequests[chunkKey];
            return this._delay(this.options.elevationRetryDelayMs * (attempt + 1)).then(L.bind(function () {
              return this._fetchChunkElevations(chunk, attempt + 1);
            }, this));
          }
          return chunk.map(function () { return 0; });
        }, this))
        .then(L.bind(function (elevations) {
          delete this._pendingElevationRequests[chunkKey];
          return elevations;
        }, this), L.bind(function (error) {
          delete this._pendingElevationRequests[chunkKey];
          throw error;
        }, this));

      this._pendingElevationRequests[chunkKey] = request;
      return request;
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

    _emitResult: function (callback, context, result) {
      if (context) {
        callback.call(context, null, result);
      } else {
        callback(null, result);
      }
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

    _getCumulativeDistances: function (coords) {
      var distances = [];
      var total = 0;

      for (var i = 0; i < coords.length; i++) {
        if (i === 0) {
          distances.push(0);
          continue;
        }

        total += coords[i - 1].distanceTo(coords[i]);
        distances.push(total);
      }

      return distances;
    },

    _selectElevationSampleIndices: function (coords, cumulativeDistances) {
      if (coords.length <= 2) {
        return coords.map(function (_, index) { return index; });
      }

      var totalDistance = cumulativeDistances[cumulativeDistances.length - 1] || 0;
      var maxSamples = Math.max(2, this.options.elevationMaxSamples || 2);
      var minSpacing = Math.max(1, this.options.elevationSampleDistance || 1);
      var effectiveSpacing = totalDistance > 0
        ? Math.max(minSpacing, totalDistance / (maxSamples - 1))
        : minSpacing;

      var indices = [0];
      var nextTarget = effectiveSpacing;

      for (var i = 1; i < coords.length - 1; i++) {
        if (cumulativeDistances[i] >= nextTarget) {
          indices.push(i);
          nextTarget += effectiveSpacing;
        }
      }

      if (indices[indices.length - 1] !== coords.length - 1) {
        indices.push(coords.length - 1);
      }

      return indices;
    },

    _expandSampledElevations: function (sampleIndices, sampleElevations, cumulativeDistances, expectedLength) {
      if (!sampleIndices.length || !sampleElevations.length || expectedLength === 0) {
        return [];
      }

      if (sampleIndices.length === 1) {
        return new Array(expectedLength).fill(sampleElevations[0]);
      }

      var expanded = new Array(expectedLength);
      var segment = 0;

      for (var i = 0; i < expectedLength; i++) {
        while (segment < sampleIndices.length - 2 && i > sampleIndices[segment + 1]) {
          segment += 1;
        }

        var startIndex = sampleIndices[segment];
        var endIndex = sampleIndices[Math.min(segment + 1, sampleIndices.length - 1)];
        var startElevation = sampleElevations[segment];
        var endElevation = sampleElevations[Math.min(segment + 1, sampleElevations.length - 1)];

        if (i <= startIndex || startIndex === endIndex) {
          expanded[i] = startElevation;
          continue;
        }

        if (i >= endIndex) {
          expanded[i] = endElevation;
          continue;
        }

        var startDistance = cumulativeDistances[startIndex];
        var endDistance = cumulativeDistances[endIndex];
        var span = endDistance - startDistance;
        var ratio = span > 0 ? (cumulativeDistances[i] - startDistance) / span : 0;
        expanded[i] = startElevation + (endElevation - startElevation) * ratio;
      }

      return expanded;
    },

    _fetchElevations: function (coords, done) {
      if (!coords || coords.length === 0 || typeof fetch !== 'function') {
        done(coords.map(function () { return 0; }));
        return;
      }

      var cumulativeDistances = this._getCumulativeDistances(coords);
      var sampleIndices = this._selectElevationSampleIndices(coords, cumulativeDistances);
      var sampleCoords = sampleIndices.map(function (index) { return coords[index]; });

      var chunkSize = this.options.elevationChunkSize;
      var cached = new Array(sampleCoords.length);
      var missingIndices = [];

      for (var idx = 0; idx < sampleCoords.length; idx++) {
        var key = this._coordKey(sampleCoords[idx]);
        if (this._elevationCache.hasOwnProperty(key)) {
          cached[idx] = this._elevationCache[key];
        } else {
          missingIndices.push(idx);
        }
      }

      if (missingIndices.length === 0) {
        done(this._expandSampledElevations(
          sampleIndices,
          this._normalizeElevations(cached, sampleCoords.length),
          cumulativeDistances,
          coords.length
        ));
        return;
      }

      var chunks = [];

      for (var m = 0; m < missingIndices.length; m += chunkSize) {
        var indexChunk = missingIndices.slice(m, m + chunkSize);
        var coordChunk = indexChunk.map(function (i) { return sampleCoords[i]; });
        chunks.push({ indices: indexChunk, coords: coordChunk });
      }

      var parts = [];
      var chain = Promise.resolve();

      for (var c = 0; c < chunks.length; c++) {
        (function (chunk, chunkIndex) {
          chain = chain.then(L.bind(function () {
            return this._fetchChunkElevations(chunk.coords, 0);
          }, this)).then(L.bind(function (elevations) {
            parts[chunkIndex] = elevations;
            if (chunkIndex < chunks.length - 1 && this.options.elevationChunkDelayMs > 0) {
              return this._delay(this.options.elevationChunkDelayMs);
            }
          }, this));
        }).call(this, chunks[c], c);
      }

      chain
        .then(L.bind(function () {
          for (var p = 0; p < parts.length; p++) {
            var elevations = parts[p] || [];
            var chunk = chunks[p];

            for (var e = 0; e < chunk.indices.length; e++) {
              var pointIndex = chunk.indices[e];
              var value = Number(elevations[e]);
              if (!isFinite(value)) value = 0;
              cached[pointIndex] = value;
              this._elevationCache[this._coordKey(sampleCoords[pointIndex])] = value;
            }
          }

          done(this._expandSampledElevations(
            sampleIndices,
            this._normalizeElevations(cached, sampleCoords.length),
            cumulativeDistances,
            coords.length
          ));
        }, this))
        .catch(function () {
          var normalized = [];
          for (var i = 0; i < sampleCoords.length; i++) {
            normalized.push(isFinite(cached[i]) ? cached[i] : 0);
          }
          done(this._expandSampledElevations(
            sampleIndices,
            normalized,
            cumulativeDistances,
            coords.length
          ));
        }.bind(this));
    },

    route: function (waypoints, callback, context) {
      var coords = [];
      var waypointIndices = [];
      var totalDistance = 0;
      var requestId = ++this._routeRequestId;

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

      var placeholderElevations = coords.map(function () { return 0; });
      this._emitResult(callback, context, this._buildResult(
        coords,
        validWaypoints,
        waypointIndices,
        totalDistance,
        placeholderElevations
      ));

      this._fetchElevations(coords, L.bind(function (rawElevations) {
        if (requestId !== this._routeRequestId) return;

        var elevations = this._normalizeElevations(rawElevations, coords.length);
        this._emitResult(callback, context, this._buildResult(
          coords,
          validWaypoints,
          waypointIndices,
          totalDistance,
          elevations
        ));
      }, this));
    },

  });

  L.Routing.straightLine = function () {
    return new L.Routing.StraightLine();
  };

})();
