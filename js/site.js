$(function() {
	// Enable jQuery for Parse
	Parse.$ = jQuery;

	Parse.initialize(
		"jeMtQiq57iqWpCV9XPUek13bNodxuPMcaUR2MgRz", 
		"5BYJySV53Ga3DxcG8Aa6k9NMidQqY1dml3B7iKqF");

	var App = new (Parse.View.extend({

		Models: {},
		Collections: {},
		Views: {},
		fn: {},

		start: function() {
			this.$app = this.$el.find('#app');
			var router = new this.Router;
			router.start();
		}

	}))({el: document.body});

	App.Models.Block = Parse.Object.extend('Block');

	App.Collections.Blocks = Parse.Collection.extend({
		model: App.Models.Block
	});

	App.Models.Type = Parse.Object.extend('Type');

	App.Collections.Types = Parse.Collection.extend({
		model: App.Models.Type,
		query: (new Parse.Query(App.Models.Type)).ascending('order')
	});

	App.Models.Series = Parse.Object.extend('Series');

	App.Collections.CurrSeries = Parse.Collection.extend({
		model: App.Models.Series,
		query: (new Parse.Query(App.Models.Series)).equalTo('user', Parse.User.current())
	});

	App.Views.Landing = Parse.View.extend({

		template: Handlebars.compile($('#landing-tpl').html()),

		render: function(){
			this.$el.html(this.template());
		}

	});

	App.Views.EditBlocks = Parse.View.extend({

		template: Handlebars.compile($('#edit-blocks-tpl').html()),

		render: function(){
			var collection = { blocks: this.collection.toJSON() };
			this.$el.html(this.template(collection));

			this.$el.find('.block-img').draggable({
				appendTo: "body",
				helper: "clone"
			});
			
			this.$el.find(".preview-list").droppable({
				accept: ".block-img",
				greedy: true,
				drop: function(event, ui) {
					var block = ui.draggable.eq(0);
					$(this).append(block.clone());
				}
			}).sortable({
				appendTo: "body",
				start: function(event, ui) {
					// $del.show();
				},
				stop: function(event, ui) {
					// $del.hide();
				}
			});
		}

	});

	App.Views.Login = Parse.View.extend({

		template: Handlebars.compile($('#login-tpl').html()),

		events: {
			'submit .login-form': 'login'
		},

		login: function(e) {
			e.preventDefault();

			var data = $(e.target).serializeArray(),
				username = data[0].value,
				password = data[1].value;

			Parse.User.logIn(username, password, {
				success: function(user) {
					Parse.history.navigate('#/dev', { trigger: true });
				},
				error: function(user, error) {
					alert(error.message);
				}
			});

		},

		render: function(){
			this.$el.html(this.template());
		}
	});

	App.Views.Dev = Parse.View.extend({

		template: Handlebars.compile($('#dev-tpl').html()),

		render: function(){
			this.$el.html(this.template());
		}

	});

	App.Views.Block = Parse.View.extend({

		template: Handlebars.compile($('#add-block-tpl').html()),

		render: function(){
			this.$el.html(this.template());
			this.loadTypes();
			this.loadSeries();
		},

		loadTypes: function(){
			var self = this;
			App.types.fetch().then(function(types){
				App.fn.renderView({
					View: App.Views.Select,
					$container: self.$el.find('.add-block-type'),
					data: { 
						collection: types,
						label: 'Type',
						field: 'type'
					}
				});
			});
		},

		loadSeries: function(){
			var self = this;
			App.currSeries.fetch().then(function(series){
				App.fn.renderView({
					View: App.Views.Select,
					$container: self.$el.find('.add-block-series'),
					data: { 
						collection: series,
						label: 'Block Series',
						field: 'series'
					}
				});
			});
		}

	});

	App.Views.Select = Parse.View.extend({

		template: Handlebars.compile($('#select-tpl').html()),

		render: function(){
			var data = { 
				items: this.collection.toJSON(),
				label: this.options.label,
				field: this.options.field
			};
			this.$el.html(this.template(data));
		}

	});

	App.Router = Parse.Router.extend({

		initialize: function(options){
			App.blocks = new App.Collections.Blocks();
			App.types = new App.Collections.Types();
			App.currSeries = new App.Collections.CurrSeries();
			// BlogApp.blog = new BlogApp.Models.Blog();
			// BlogApp.category = new BlogApp.Models.Category();
			// BlogApp.query = {
			// 	blog: new Parse.Query(BlogApp.Models.Blog),
			// 	category: new Parse.Query(BlogApp.Models.Category)
			// };
		},
		
		start: function(){
			Parse.history.start({root: '/blocks/'});
		},

		routes: {
			'': 'landing',
			'new': 'new',
			'login': 'login',
			'dev': 'dev',
			'add-block': 'addBlock'
		},

		landing: function() {
			App.fn.renderView({
				View: App.Views.Landing,
			});
		},

		new: function() {
			App.blocks.fetch().then(function(blocks){
				App.fn.renderView({
					View: App.Views.EditBlocks,
					data: { collection: blocks }
				});
			})
		},

		login: function() {
			App.fn.renderView({
				View: App.Views.Login
			});
		},

		dev: function() {
			App.fn.checkLogin();
			var currentUser = Parse.User.current();
			App.fn.renderView({
				View: App.Views.Dev,
				data: { model: currentUser }
			});
		},

		addBlock: function() {
			App.fn.checkLogin();
			App.fn.renderView({
				View: App.Views.Block,
			});
		}

	});

	// Render View Function - render data in a View Object
	App.fn.renderView = function(options) {
		var View = options.View, // type of View
			data = options.data || null, // data obj to render in the view
			$container = options.$container || App.$app, // container to put the view
			notInsert = options.notInsert, // put the el in the container or return el as HTML
			view = new View(data);
		view.render();
		if (notInsert) {
			return view.el.outerHTML;
		} else {
			$container.html(view.el);
		}
	};

	App.fn.checkLogin = function() {
		var currentUser = Parse.User.current();
		if (!currentUser) {
			Parse.history.navigate('#/login', { trigger: true });
		} else {
			return;
		}
	};

	App.start();

});