export const GammaCtrl = L.Control.extend({
	options: {
		gamma: undefined,
		gammaChanged: undefined,
		position: 'bottomright',
		style: 'padding:2px 5px 5px 5px;background-color:white;box-shadow: 0 1px 5px rgba(0,0,0,0.4);border-radius: 5px;'
	},

	initialize: function (options) {
		L.Util.setOptions(this, options);
	},

	changeHandler: function(e) {
		const idx = e.target.selectedIndex;

		if (this.options.gammaChanged) {
			const val = e.target[idx].value;
			this.options.gammaChanged(val);
		}
	},

	onAdd: function (map) {
		const addOption = (parent, val, txt) => {
			const option = L.DomUtil.create('option', null, parent);
			option.setAttribute("value", val);
			option.innerHTML = txt ? txt : val;
		};

		const container = L.DomUtil.create('div', 'gamma-container', L.DomUtil.get('map'));
		container.setAttribute("style", this.options.style);

		const lbl = L.DomUtil.create('div', null, container);
		lbl.innerHTML = 'Gamma';
		lbl.setAttribute("style", "text-align:center;");

		const select = L.DomUtil.create('select', null, container);
		[0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5].forEach(v => addOption(select, v));

		select.value = this.options.gamma ? this.options.gamma : 1;

		L.DomEvent.on(select, 'click', L.DomEvent.stopPropagation);
		L.DomEvent.on(select, 'change', this.changeHandler.bind(this));

		return container;
	},

	onRemove: function (map) {
		map.off('change', this.changeHandler.bind(this));
	},
});
