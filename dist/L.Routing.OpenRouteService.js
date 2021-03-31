(function () {
	'use strict';

	// Browserify
	// var L = require('leaflet');
	// var corslite = require('corslite');
  //
	L.Routing = L.Routing || {};

	L.Routing.OpenRouteService = L.Class.extend({
		options: {
			serviceUrl: 'https://api.openrouteservice.org/v2/directions/',
			timeout: 30 * 1000,
			urlParameters: {}
		},

		initialize: function (apiKey, options) {
			this._apiKey = apiKey;
			L.Util.setOptions(this, options);
		},

		route: function (waypoints, callback, context, options) {
			var timedOut = false,
				wps = [],
				url,
				timer,
        headers,
        body,
				wp,
				i;

			options = options || {};
			var builtUrl = this.buildRouteUrl(waypoints, options);
      url = builtUrl[0];
      headers = builtUrl[1];
      body = builtUrl[2];

			for (i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				wps.push({
					latLng: wp.latLng,
					name: wp.name,
					options: wp.options
				});
			}
      
      // Perform the request to Open Route Service
      var current = this;
      $.post({
        dataType: "json",
        headers: headers,
        url: url,
        data: body,
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

			for (i = 0; i < 1; i++) {
        var path = response.features[i];

				coordinates = this._decodePolyline(path.geometry);
        elevations = this._getElevations(path.geometry);
				startingSearchIndex = 0;
				instructions = [];
				waypoints = [];
				time = 0;
				distance = 0;

        var segments = response.features[0].properties.segments;
				for(j = 0; j < segments.length; j++) {
					leg = segments[j];
					steps = leg.steps;
					for(k = 0; k < steps.length; k++) {
						step = steps[k];

						distance += step.distance;
						time += step.duration;
						instruction = this._convertInstructions(step, coordinates);
						instructions.push(instruction);
						waypoint = coordinates[step.way_points[1]];
						waypoints.push(waypoint);
					}
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

      var profile = 'foot-hiking';
      baseUrl = this.options.serviceUrl + profile + '/geojson';

      var finalUrl = baseUrl;
			//finalUrl = baseUrl + L.Util.getParamString(L.extend({
			//	instructions: true,
			//	instructions_format: 'text',
			//	geometry_format: 'geojson',
			//	preference: 'recommended',
			//	units: 'm',
			//	profile: profile,
			//	api_key: this._apiKey
			//}, this.options.urlParameters), baseUrl);

      var body = JSON.stringify({coordinates: coordinates, elevation: true});
      var headers = {Authorization: this._apiKey, "Content-Type": "application/json"}

      return [finalUrl, headers, body];
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

	L.Routing.openrouteservice = function (apiKey, options) {
		return new L.Routing.OpenRouteService(apiKey, options);
	};

	// Browserify
	// module.exports = L.Routing.OpenRouteService;
})();
