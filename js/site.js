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

	App.Models.Block = Parse.Object.extend('Block', {

		preProcess: function(data) {

			data.type = new App.Models.Type().set('objectId', data.type);
			data.series = new App.Models.Series().set('objectId', data.series);
			data.content = jQuery.parseJSON(data.content);
			data.help = jQuery.parseJSON(data.help);
			data.user = this.get('user') || Parse.User.current();

			if (data.file) {
				data.img = new App.Models.Image().uploadAsBlockPreview(data, this);
			} else {
				this.update(data);
			}

		},

		update: function(data) {
			this.set(data).save(null,{
				success: function(block) {
					console.log(block);
				}, error: function(block, error) {
					console.log(error);
				}
			});
		}
	});

	App.Collections.Blocks = Parse.Collection.extend({
		model: App.Models.Block
	});

	App.Models.Type = Parse.Object.extend('Type');

	App.Collections.Types = Parse.Collection.extend({
		model: App.Models.Type,
		query: (new Parse.Query(App.Models.Type)).ascending('order')
	});

	App.Models.Series = Parse.Object.extend('Series');

	App.Collections.Series =  Parse.Collection.extend({
		model: App.Models.Series
	});

	App.Collections.UserSeries =  Parse.Collection.extend({
		model: App.Models.Series,
		query: (new Parse.Query(App.Models.Series)).equalTo('user', Parse.User.current())
	});

	App.Models.Image = Parse.Object.extend('Image', {
		uploadAsBlockPreview: function(data, block) {

			var self = this,
				file = data.file,
				parseFile = new Parse.File(file.name, file);

			parseFile.save().then(function() {

				self.set({
					url: parseFile,
					uploader: Parse.User.current()
				}).save(null, {
					success: function(img) {
						data.img = img;
						data.imgURL = data.img.get('url').url();
						data.file = null;
						block.update(data);
					}, error: function(img, error) {
						console.log(error);
					}
				});

			});
		}
	});

	App.Views.Landing = Parse.View.extend({

		template: Handlebars.compile($('#landing-tpl').html()),

		render: function(){
			this.$el.html(this.template());
		}

	});

	App.Views.EditBlocks = Parse.View.extend({

		template: Handlebars.compile($('#page-edit-tpl').html()),

		className: 'page-edit-tpl',

		events: {
			'mouseenter .types': 'showSide2',
			'mouseleave .types': 'hideSide2',
			'mouseenter .side-2': 'showSide2',
			'mouseleave .side-2': 'hideSide2',
			'mouseenter .type': 'showType',
		},

		render: function(){
			var self = this,
				collection = { blocks: self.collection.toJSON() };

			self.$el.html(self.template(collection));

			// Load Types
			App.fn.loadComponent({
				collection: App.types,
				View: App.fn.generateView({
					templateId: '#page-edit-type',
					type: 'collection',
					tagName: 'ul'
				}),
				$container: self.$el.find('.types'),
				callback: function(types) {
					_.each(types, function(type, i){
						$('<ul>')
							.attr('id', types.at(i).id)
							.addClass('blocks')
							.appendTo(self.$el.find('.side-2'));
					});
					_.each(collection.blocks, function(block, i) {
						$('#' + block.objectId).appendTo($('#' + block.type.objectId));
					});
				}
			});

			self.enableDrag();
		},

		showSide2: function() {
			this.$el.find('.side-2').addClass('show');
		},

		hideSide2: function() {
			this.$el.find('.side-2').removeClass('show');
		},

		showType: function(e) {
			var id = $(e.target).closest('.type').data('id');
			this.$el.find('.blocks').hide();
			this.$el.find('#'+ id).show();
		},

		enableDrag: function(){

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

	App.Views.UpdateBlock = Parse.View.extend({

		template: Handlebars.compile($('#update-block-tpl').html()),

		events: {
			'submit .update-block-form': 'submit'
		},

		submit: function(e){
			e.preventDefault();
			this.model = this.model || new App.Models.Block();
			this.model.preProcess({
				type:		this.$el.find('#update-block-type').val(),
				series:		this.$el.find('#update-block-series').val(),
				name:		this.$el.find('#update-block-name').val(),
				file:		this.$el.find('#update-block-file')[0].files[0],
				html:		this.$el.find('#update-block-html').val(),
				css:		this.$el.find('#update-block-css').val(),
				content:	this.$el.find('#update-block-content').val(),
				help:		this.$el.find('#update-block-help').val()
			});
		},

		render: function(){
			
			var self = this;

			self.$el.html(self.template());

			// Load Types
			App.fn.loadComponent({
				collection: App.types,
				View: App.Views.Select,
				$container: self.$el.find('.update-block-type'),
				data: {
					label: 'Type',
					field: 'type'
				}
			});

			// Load User Series
			App.fn.loadComponent({
				collection: App.userSeries,
				View: App.Views.Select,
				$container: self.$el.find('.update-block-series'),
				data: {
					label: 'Block Series',
					field: 'series'
				}
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
			App.series = new App.Collections.Series();
			App.userSeries = new App.Collections.UserSeries();

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
				View: App.Views.UpdateBlock,
			});
		}

	});

	App.fn.checkLogin = function() {
		var currentUser = Parse.User.current();
		if (!currentUser) {
			Parse.history.navigate('#/login', { trigger: true });
		} else {
			return;
		}
	};

	App.fn.generateView = function(options) {
		return Parse.View.extend({
			template: Handlebars.compile($(options.templateId).html()),
			tagName: options.tagName || 'div',
			className: options.className || null,
			render: function() {
				var data;
				if (options.type === 'collection') {
					data = { items: this.collection.toJSON() };
					data = _.extend({}, options.data, data);
					console.log(data);
				}
				this.$el.html(this.template(data));
			}
		});
	};

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

	App.fn.loadComponent = function(options) {

		// TODO - Check don't fetch if fetched
		// console.log(options.collection);

		options.collection.fetch().then(function(collection){

			var data = {collection: collection};
			data = _.extend({}, options.data, data);

			App.fn.renderView({
				View: options.View,
				$container: options.$container,
				data: data
			});

			options.callback(collection);
		});
	}

	App.start();

});