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

		initialize: function (profile, options) {
			L.Util.setOptions(this, options);
      this._profile = profile;
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

			for (k = 0; k < 1; k++) {
        var path = response.features[k];

				coordinates = this._decodePolyline(path.geometry);
        elevations = this._getElevations(path.geometry);
				startingSearchIndex = 0;
				instructions = [];
				waypoints = [];
				time = 0;
				distance = 0;

        time = response.features[0].properties['total-time'];

        var segments = response.features[0].properties.messages;

				for(j = 1; j < segments.length; j++) {
					leg = segments[j];

          distance += parseInt(leg[3]);

					//steps = leg.steps;
					//for(k = 0; k < steps.length; k++) {
					//	step = steps[k];

					//	//instruction = this._convertInstructions(step, coordinates);
					//	//instructions.push(instruction);
					//	//waypoint = coordinates[step.way_points[1]];
					//	//waypoints.push(waypoint);
					//}
				}

        // Compute the total (min, max, total positive) elevation
        // Total elevation: every meter gained is added
        var totalPositiveElevation = 0;
        for (var i = 1; i < elevations.length; i++)
          if (elevations[i-1] < elevations[i])
            totalPositiveElevation += elevations[i] - elevations[i-1];
        
        var totalNegativeElevation = 0;
        for (var i = 1; i < elevations.length; i++)
          if (elevations[i-1] > elevations[i])
            totalNegativeElevation += elevations[i-1] - elevations[i];

        // MaxElevation: the longest positive segment 
        var maxElevation = 0;
        var tmp = [];
        var threshold = .0;
        for (var i = 1; i < elevations.length; i++)
        {
          if ((elevations[i-1] < elevations[i]) || (elevations[i-1] - elevations[i] < threshold))
          {
              tmp.push(elevations[i] - elevations[i-1]);
          }
          else
          {
            var red = tmp.reduce((a, b) => a + b, 0);
            if (red > maxElevation)
              maxElevation = tmp.reduce((a, b) => a + b, 0);
            tmp = [];
          }
        }
        
        // MinElevation: the longest negative segment 
        var minElevation = 0;
        var tmp = [];
        var threshold = .0;
        for (var i = 1; i < elevations.length; i++)
        {
          if ((elevations[i] < elevations[i-1]) || (elevations[i-1] - elevations[i] < threshold))
          {
              tmp.push(elevations[i-1] - elevations[i]);
          }
          else
          {
            var red = tmp.reduce((a, b) => a + b, 0);
            if (red > minElevation)
              minElevation = tmp.reduce((a, b) => a + b, 0);
            tmp = [];
          }
        }

        // TopElevation: the top point minus the bottom one
        var topElevation = Math.max.apply(null, elevations) - Math.min.apply(null, elevations);

        // Elevation finish - start
        var elevation = elevations[elevations.length-1] - elevations[0];

				alts.push({
					name: 'Hiking Itinerary',
					coordinates: coordinates,
          elevations: elevations,
					instructions: instructions,
					summary: {
						totalDistance: distance,
						totalTime: time,
					},
          PositiveElevation: totalPositiveElevation.toFixed(0),
          NegativeElevation: totalNegativeElevation.toFixed(0),
          maxLenElevation : maxElevation.toFixed(0),
          minLenElevation : minElevation.toFixed(0),
          topElevation: topElevation.toFixed(0),
          elevation: elevation.toFixed(0),
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

      var profile = this._profile;

      baseUrl = this.options.serviceUrl + "lonlats="
      for (var i = 0; i < coordinates.length; i++)
        baseUrl = baseUrl + coordinates[i][0] + "," + coordinates[i][1] + "|"
      baseUrl = baseUrl + "&profile=" + profile + "&alternativeidx=0&format=geojson"

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
