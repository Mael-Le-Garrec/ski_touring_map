var RoutingControl = L.Control.Layers.extend({
    options: {
      position: 'topleft',
      collapsed: true
    },
  	
    //
    initialize: function (routers, routerBase) {
      L.setOptions(this, null);

      this._layerControlInputs = [];
      this._layers = [];
      this._lastZIndex = 0;
      this._handlingClick = false;
      this._routerBase = routerBase;

      for (const [name, values] of Object.entries(routers)){
        var router = values[0];
        var image = values[1];
        this.addBaseLayer(router, name, image);
      }
      
    },

    addTo: function (map) {
      L.Control.prototype.addTo.call(this, map);
      // Trigger expand after Layers Control has been inserted into DOM so that is now has an actual height.
      return this._expandIfNotCollapsed();
    },

    //
    onRemove: function () {
    },


    // Change icon to reflect the means of transport
    _updateIcon: function(router) {
      for (const [name, values] of Object.entries(this._layers)){
        if (values['layer'] == router)
        {
          L.DomUtil.get(this._layersLink).style.setProperty('background-image', "url('dist/img/"+values['image']+"')", 'important');
          break;
        }
      };
    },
    
    //
    _onInputClick: function () {
      var inputs = this._layerControlInputs,
          input, layer;
      var addedLayers = [],
          removedLayers = [];

      this._handlingClick = true;

      for (var i = inputs.length - 1; i >= 0; i--) {
        input = inputs[i];
        layer = this._getLayer(input.layerId).layer;

        if (input.checked) {
          addedLayers.push(layer);
        } else if (!input.checked) {
          removedLayers.push(layer);
        }
      }

      var addedRouter = addedLayers[0];
      var waypoints = this._routerBase.getWaypoints();

      this._routerBase.setRouter(addedRouter);
      this._routerBase.setWaypoints(waypoints);

      this._updateIcon(addedRouter);

      this._handlingClick = false;
      this._refocusOnMap();
    },

    // 
    addBaseLayer: function (layer, name, image) {
  		this._addLayer(layer, name, image);
  		return (this._map) ? this._update() : this;
  	},

    //
  	_addLayer: function (layer, name, image, overlay) {
      if (this._map) {
        //layer.on('add remove', this._onLayerChange, this);
      }

      this._layers.push({
        layer: layer,
        name: name,
        overlay: overlay,
        image: image
      });

      if (this.options.sortLayers) {
        this._layers.sort(Util.bind(function (a, b) {
          return this.options.sortFunction(a.layer, b.layer, a.name, b.name);
        }, this));
      }

      if (this.options.autoZIndex && layer.setZIndex) {
        this._lastZIndex++;
        layer.setZIndex(this._lastZIndex);
      }

      this._expandIfNotCollapsed();
    },

    //
  	_expandIfNotCollapsed: function () {
      if (this._map && !this.options.collapsed) {
        this.expand();
      }
      return this;
    },

    //
  	_update: function () {
      if (!this._container) { return this; }

      L.DomUtil.empty(this._baseLayersList);
      L.DomUtil.empty(this._overlaysList);

      this._layerControlInputs = [];
      var baseLayersPresent, overlaysPresent, i, obj, baseLayersCount = 0;

      for (i = 0; i < this._layers.length; i++) {
        obj = this._layers[i];
        this._addItem(obj);

        overlaysPresent = overlaysPresent || obj.overlay;
        baseLayersPresent = baseLayersPresent || !obj.overlay;
        baseLayersCount += !obj.overlay ? 1 : 0;
      }

      // Hide base layers section if there's only one layer.
      //if (this.options.hideSingleBase) {
      //  baseLayersPresent = baseLayersPresent && baseLayersCount > 1;
      //  this._baseLayersList.style.display = baseLayersPresent ? '' : 'none';
      //}

      //this._separator.style.display = overlaysPresent && baseLayersPresent ? '' : 'none';

      return this;
    },

    //
    _addItem: function (obj) {
      var label = document.createElement('label'),
          checked = this._routerBase.getRouter() == obj.layer,
          input;

      if (obj.overlay) {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'leaflet-control-layers-selector';
        input.defaultChecked = checked;
      } else {
        input = this._createRadioElement('leaflet-base-layers_' + L.Util.stamp(this), checked);
      }

      this._layerControlInputs.push(input);
      input.layerId = L.Util.stamp(obj.layer);

      L.DomEvent.on(input, 'click', this._onInputClick, this);

      var name = document.createElement('span');
      name.innerHTML = ' ' + obj.name;

      // Helps from preventing layer control flicker when checkboxes are disabled
      // https://github.com/Leaflet/Leaflet/issues/2771
      var holder = document.createElement('div');

      label.appendChild(holder);
      holder.appendChild(input);
      holder.appendChild(name);

      var container = obj.overlay ? this._overlaysList : this._baseLayersList;
      container.appendChild(label);

      this._checkDisabledLayers();
      return label;
    },

    //
    _checkDisabledLayers: function () {
      var inputs = this._layerControlInputs,
          input,
          layer,
          zoom = this._map.getZoom();

      for (var i = inputs.length - 1; i >= 0; i--) {
        input = inputs[i];
        layer = this._getLayer(input.layerId).layer;
        input.disabled = (layer.options.minZoom !== undefined && zoom < layer.options.minZoom) ||
                         (layer.options.maxZoom !== undefined && zoom > layer.options.maxZoom);

      }
    },


    //
    _initLayout: function () {
      var className = 'leaflet-control-layers',
          container = this._container = L.DomUtil.create('div', className),
          collapsed = this.options.collapsed;

      // makes this work on IE touch devices by stopping it from firing a mouseout event when the touch is released
      container.setAttribute('aria-haspopup', true);

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      var section = this._section = L.DomUtil.create('section', className + '-list');

      if (collapsed) {
        this._map.on('click', this.collapse, this);

        if (!L.Browser.android) {
          L.DomEvent.on(container, {
            mouseenter: this.expand,
            mouseleave: this.collapse
          }, this);
        }
      }

      var link = this._layersLink = L.DomUtil.create('a', className + '-toggle ' + className + "-custom-toggle", container);
      link.href = '#';
      link.title = 'Layers';

      if (L.Browser.touch) {
        L.DomEvent.on(link, 'click', L.DomEvent.stop);
        L.DomEvent.on(link, 'click', this.expand, this);
      } else {
        L.DomEvent.on(link, 'focus', this.expand, this);
      }

      if (!collapsed) {
        this.expand();
      }

      this._baseLayersList = L.DomUtil.create('div', className + '-base', section);
      this._separator = L.DomUtil.create('div', className + '-separator', section);
      this._overlaysList = L.DomUtil.create('div', className + '-overlays', section);

      container.appendChild(section);
    },

});
