if(typeof(L) !== 'undefined') {

L.CanvasGeoJSONLayer = L.CanvasLayer.extend({

    options : {
        enableOffset: true
    },

	includes:[L.CanvasRenderer],

    features: [],

    onAdd: function(map) {
        this._map = map;
        L.CanvasLayer.prototype.onAdd.call(this, map);
    },

    render: function() {
        var canvas = this.getCanvas();

     
        this._drawFeatures(this.features,{
            canvas: canvas
        });

    },

    getMap :function() {
        return this._map;
    }
});

}