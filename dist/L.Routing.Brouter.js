(function () {
	'use strict';

	// Browserify
	// var L = require('leaflet');
	// var corslite = require('corslite');
  //
	L.Routing = L.Routing || {};

	L.Routing.Brouter = L.Class.extend({
		options: {
      serviceUrl: 'https://brouter.de/brouter?',
			timeout: 30 * 1000,
			urlParameters: {}
		},

		initialize: function (options) {
			L.Util.setOptions(this, options);
		},

		route: function (waypoints, callback, context, options) {
			var timedOut = false,
				wps = [],
				url,
				timer,
				wp,
				i;

			options = options || {};
			var url = this.buildRouteUrl(waypoints, options);

			for (i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				wps.push({
					latLng: wp.latLng,
					name: wp.name,
					options: wp.options
				});
			}
      
      // Perform the request to Brouter
      var current = this;
      $.get({
        dataType: "json",
        url: url,
      }).fail(function() {
          console.log("Couldn't perform the query " + url);
        })
        .done(function(resp) {
          var data = resp;
          console.log(data);
          current._routeDone(data, wps, callback, context);
        });

			return this;
		},

		_routeDone: function (response, inputWaypoints, callback, context) {
			var alts = [],
			    waypoints,
			    waypoint,
			    coordinates,
          elevations,
			    i, j, k,
			    instructions,
			    distance,
			    time,
          leg,
          steps,
          step,
			    maneuver,
			    startingSearchIndex,
			    instruction,
			    path;

			context = context || callback;

			for (i = 0; i < 1; i++) {
        var path = response.features[i];

				coordinates = this._decodePolyline(path.geometry);
        elevations = this._getElevations(path.geometry);
				startingSearchIndex = 0;
				instructions = [];
				waypoints = [];
				time = 0;
				distance = 0;

        time = response.features[0].properties['total-time'];
        console.log("time: " + time);

        console.log(response.features[0]);
        var segments = response.features[0].properties.messages;

				for(j = 1; j < segments.length; j++) {
					leg = segments[j];

          distance += leg[4] / 10;

					//steps = leg.steps;
					//for(k = 0; k < steps.length; k++) {
					//	step = steps[k];

					//	//instruction = this._convertInstructions(step, coordinates);
					//	//instructions.push(instruction);
					//	//waypoint = coordinates[step.way_points[1]];
					//	//waypoints.push(waypoint);
					//}
				}

				alts.push({
					name: 'Routing option ' + i,
					coordinates: coordinates,
          elevations: elevations,
					instructions: instructions,
					summary: {
						totalDistance: distance,
						totalTime: time,
					},
					inputWaypoints: inputWaypoints,
					waypoints: waypoints
				});
			}

			callback.call(context, null, alts);
		},

		_getElevations: function (geometry) {
			var coords = geometry["coordinates"], i;

      var elevations = [];
      // Get elevations
      for (i = 0; i < coords.length; i++) {
         elevations.push(geometry["coordinates"][i][2]);
      }
			return elevations;
		},


		_decodePolyline: function (geometry) {
			var polylineDefined = polyline.fromGeoJSON(geometry);
			var coords = polyline.decode(polylineDefined, 5),
				latlngs = new Array(coords.length),
				i;
			for (i = 0; i < coords.length; i++) {
				latlngs[i] = new L.LatLng(coords[i][0], coords[i][1]);
			}
			return latlngs;
		},

		buildRouteUrl: function (waypoints, options) {
			var computeInstructions =
				true,
				locs = [],
				i,
				baseUrl;
      var coordinates = [];
      
			for (var i = 0; i < waypoints.length; i++) {
				coordinates.push(new Array(waypoints[i].latLng.lng, waypoints[i].latLng.lat));
			}

      var profile = 'hiking-beta';

      baseUrl = this.options.serviceUrl + "lonlats="
      for (var i = 0; i < coordinates.length; i++)
        baseUrl = baseUrl + coordinates[i][0] + "," + coordinates[i][1] + "|"
      baseUrl = baseUrl + "&profile=" + profile + "&alternativeidx=0&format=geojson"

      console.log(baseUrl);
      return baseUrl;
		},

		_convertInstructions: function (step, coordinates) {
			return {
				text: step.instruction,
				distance: step.distance,
				time: step.duration,
				index: step.way_points[0]
			};
		},
	});

	L.Routing.brouter = function (options) {
		return new L.Routing.Brouter(options);
	};

	// Browserify
	// module.exports = L.Routing.OpenRouteService;
})();
