if(typeof(L) !== 'undefined') {

L.HistoricalGeoJsonLayer = L.CanvasGeoJSONLayer.extend({

    options: {
        animationInterval: 300,
        redrawOnMove: false,
        dateFormat : function(date) {
            return date.format();
        }
    },

    _timePointFeatures : [],

    features :[],

    _sliderControl : null,

    initialize: function (options) { 
        L.CanvasGeoJSONLayer.prototype.initialize.call(this, options);
    },

    _cmpFeaturesByDate : function(tpf1,tpf2) {
        return tpf1.date.diff(tpf2.date)
    },

    onAdd: function (map) {
        this._map = map;

        this._staticPane = map._createPane('leaflet-tile-pane', map._container);
        this._staticPane.appendChild(this._canvas);

        map.on({
          'viewreset': this._reset,
          'move': this._render
        }, this);

       // map.on('move', this._render, this);//function(){ console.log("a"); }, this);
        map.on('resize', this._reset, this);

        if(this.options.tileLoader) {
          this._initTileLoader();
        }

        map.on("dragstart",function(){this.dragging=true;},this);
        map.on("dragend",function(){this.dragging=false; this.redraw()},this);

        this._reset();
    },

    onRemove: function (map) {
        this._removeControl();
        map._container.removeChild(this._staticPane);
        map.off({
            'viewreset': this._reset,
            'move': this._render,
            'resize': this._reset
        }, this);

        if(this._animationTimer) {
            this._toggleAnimation();
        }
    },

    _removeControl : function() {
        if(this._sliderControl){
            this.getMap().removeControl(this._sliderControl);    
        }
    },

    addTimePoint: function(date, features) {
        this._timePointFeatures.push({
            date: moment(date), // We use moment js dates to ease date manipulation.
            features: features
        });

        this._timePointFeatures.sort(this._cmpFeaturesByDate);

        this._updateControl();


        this._onSliderChange(0);
    },

    _updateControl : function() {



        if(this._sliderControl) {
            this._removeControl();
        }

        if(!this.getMap()) {
            return;
        }

        var sliderControl = this._sliderControl = L.control({position:"bottomleft"});

        var self = this;

        sliderControl.onAdd = function() {
            var div = L.DomUtil.create('div', 'leaflet-bar leaflet-update-interval');
            if(!self._timePointFeatures.length) {
                div.innerHTML+="The layer doesn't have any data";
                return div;
            }

            var row1 = L.DomUtil.create("div", "", div);

            var slider = sliderControl.slider = L.DomUtil.create("input","", row1);
            slider.value=0;
            slider.min = 0;
            slider.max = self._timePointFeatures.length-1;
            slider.type="range";
            L.DomEvent.addListener(slider,"change", function(){
                self._onSliderChange(self._sliderControl.slider.value);
            });


            var animButton = sliderControl.animButton = L.DomUtil.create("button","", row1);
            animButton.innerHTML="Play animation";
            animButton.style.float="right";

            L.DomEvent.addListener(animButton,"click", function(){
                self._toggleAnimation();
            });

            L.DomEvent.addListener(div, 'mousedown', L.DomEvent.stopPropagation);
            L.DomEvent.addListener(div, 'mouseup', L.DomEvent.stopPropagation);

            L.DomEvent.addListener(div, 'touchstart', L.DomEvent.stopPropagation);
            L.DomEvent.addListener(div, 'touchend', L.DomEvent.stopPropagation);

            var row2 = sliderControl.label = L.DomUtil.create("div","",div);
            row2.style.whiteSpace="nowrap";

            return div;
        };

        sliderControl.addTo(this.getMap());
    },

     render: function() {
        if(!this.options.redrawOnMove && this.dragging) {
            return;
        }


        if(!this._sliderControl) {
            this._updateControl();
            this._onSliderChange(0);
        }

        var canvas = this.getCanvas();

        
        this._drawFeatures(this.features,{
            canvas: canvas
        });

    },


    _onSliderChange : function(timePointIdx) {
        if(!this.getMap()) {
            return;
        }
        var timePointData = this._timePointFeatures[parseInt(timePointIdx,10)];
        this.features = timePointData.features;
        this._sliderControl.slider.value = timePointIdx;

        this._sliderControl.label.innerHTML = this.options.dateFormat(timePointData.date);

        this.redraw();
    },

    _toggleAnimation : function() {
        if(this._animationTimer) {
            // If we are currently animating, we clear the interval.
            this._sliderControl.animButton.innerHTML="Play animation";
            clearInterval(this._animationTimer);
            this._animationTimer= null;
        } else {
            this._sliderControl.animButton.innerHTML="Stop animation";
            
            var self = this;
            this._animationTimer = setInterval(function() {
                self._onSliderChange((parseInt(self._sliderControl.slider.value,10)+1) % self._timePointFeatures.length);
            },this.options.animationInterval);

        }
    }
    
});

}