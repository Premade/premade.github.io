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
			data.theme = new App.Models.Theme().set('objectId', data.theme);
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

	App.Models.Page = Parse.Object.extend('Page', {
		update: function(options) {
			this.set(options.data).save().then(function(page){
				options.callback(page);
			});
		}
	});

	App.Models.Type = Parse.Object.extend('Type');

	App.Collections.Types = Parse.Collection.extend({
		model: App.Models.Type,
		query: (new Parse.Query(App.Models.Type)).ascending('order')
	});

	App.Models.Theme = Parse.Object.extend('Theme');

	App.Collections.Themes =  Parse.Collection.extend({
		model: App.Models.Theme
	});

	App.Collections.UserThemes =  Parse.Collection.extend({
		model: App.Models.Theme,
		query: (new Parse.Query(App.Models.Theme)).equalTo('user', Parse.User.current())
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
						data.imgUrl = data.img.get('url').url();
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

	App.Views.EditPageBlocks = Parse.View.extend({

		template: Handlebars.compile($('#page-edit-tpl').html()),

		className: 'container-fluid page-edit',

		events: {
			'mouseenter .theme-curr': 'showSide2',
			'mouseleave .theme-curr': 'hideSide2',
			'mouseenter .side-2': 'showSide2',
			'mouseleave .side-2': 'hideSide2',
			'click .theme': 'changeTheme',
			'click .get-html': 'generatePage'
		},

		render: function(){

			var self = this;

			self.currTheme = self.options.theme;

			self.$el.html(self.template(self.currTheme.attributes));

			// Load Theme
			self.loadThemes();
			self.loadBlocks(self.collection);
		},

		loadThemes: function() {
			var self = this;
			App.fn.loadComponent({
				collection: App.themes,
				$container: self.$el.find('.side-2'),
				View: App.fn.generateView({
					templateId: '#page-edit-themes',
					type: 'collection',
					tagName: 'ul',
				})
			});
		},

		loadBlocks: function(blocks) {
			var self = this;
			App.fn.loadComponent({
				collection: blocks,
				$container: self.$el.find('.blocks-temp'),
				View: App.fn.generateView({
					templateId: '#page-edit-blocks',
					type: 'collection',
					tagName: 'ul',
				}),
				callback: function(blocks) {
					self.blocks = blocks;
					self.loadTypes();
					self.enableDrag();
				}
			});
		},

		loadTypes: function() {
			var self = this;
			App.fn.loadComponent({
				collection: App.types,
				$container: self.$el.find('.types'),
				View: App.fn.generateView({
					templateId: '#page-edit-types',
					type: 'collection',
					tagName: 'ul'
				}),
				callback: function(types) {
					_.each(self.blocks, function(b, i) {
						var block = self.blocks.at(i);
						$('#' + block.id).appendTo($('#' + block.get('type').id));
					});
					_.each(self.$el.find('.blocks'), function(block, i) {
						if ($(block).find('.block').length === 0) {
							$(block).parent().hide();
						}
					});
				}
			});
		},

		changeTheme: function (e) {
			var self = this,
				id = $(e.target).closest('.theme').data('id');

			if (id === self.currTheme.id) return;

			var themeQuery = new Parse.Query(App.Models.Theme);

			themeQuery
				.equalTo("objectId", id)
				.first()
				.then(function(theme) {
					self.currTheme = theme;
					App.fn.findThemeBlocks(theme, function(blocks){
						self.loadBlocks(blocks);
					});
					self.$el.find('.theme-curr-name').html(theme.get('name'));
				});
		},

		generatePage: function() {
			var self = this,
				$blocks = self.$el.find('.preview .block-img'),
				page = {};

			page.blocks = [];

			_.each($blocks, function($b, i){
				page.blocks[i] = {
					objectId: $blocks.eq(i).data('id')
				};
			});

			App.fn.renderView({
				View: App.Views.EditPageContent,
				data: { page: page }
			});
		},

		showSide2: function() {
			this.$el.find('.side-2').addClass('show');
		},

		hideSide2: function() {
			this.$el.find('.side-2').removeClass('show');
		},

		enableDrag: function(){

			this.$el.find('.block-img').draggable({
				appendTo: ".preview-list",
				helper: "clone"
			});
			
			this.$el.find(".preview-list").droppable({
				accept: ".side .block-img",
				greedy: false,
				drop: function(event, ui) {
					var block = ui.draggable.eq(0);
					$(this).append(block.clone());
				}
			}).sortable({
				appendTo: ".preview-list",
				axis: "y",
				start: function(event, ui) {
					// $del.show();
				},
				stop: function(event, ui) {
					// $del.hide();
				}
			});
		}

	});

	App.Views.EditPageContent = Parse.View.extend({

		template: Handlebars.compile($('#content-edit-tpl').html()),

		className: 'container-fluid page-edit',

		events: {
			'change .field': 'updatePreview',
		},

		updatePreview: function(e) {
			var $e = $(e.target),
				block = $e.closest('.edit-block').data('id'),
				field = $e.data('key'),
				val = $e.val();
			this.$el.find('.preview-html .' + block + ' .' + field).html(val);
		},

		render: function() {
			var self = this,
				page;

			if (self.model) {
				page = self.model.get('json');
			} else {
				page = self.options.page;
			}

			App.fn.getBlocks(page, function(blocks) {

				console.log(blocks);

				self.$el.html(self.template({
					blocks: blocks
				}));

				App.fn.renderBlocks({
					blocks: blocks,
					$container: self.$el.find('.preview-html')
				});

				self.blocks = blocks;
			});

		}

	});

	App.Views.Page = Parse.View.extend({

		render: function() {

			var self = this,
				page;

			if (self.model) {
				var page = self.model.get('json');
			} else {
				page = self.options.page;
			}
		
			App.fn.getBlocks(page, function(blocks){
				App.fn.renderBlocks({
					blocks: blocks
				});
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
				theme:		this.$el.find('#update-block-theme').val(),
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
				$container: self.$el.find('.update-block-theme'),
				data: {
					label: 'Theme',
					field: 'theme'
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

			App.$pageStyles = $('#page-styles');

			// App.blocks = [];
			App.blocks = new App.Collections.Blocks();
			App.types = new App.Collections.Types();
			App.themes = new App.Collections.Themes();
			App.userThemes = new App.Collections.UserThemes();

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
			'page/:id': 'page',
			'edit/:id': 'edit',
			'login': 'login',
			'dev': 'dev',
			'add-block': 'addBlock',
		},

		landing: function() {
			App.fn.renderView({
				View: App.Views.Landing,
			});
		},

		new: function() {
			// Get Default Theme
			var themeQuery = new Parse.Query(App.Models.Theme);

			themeQuery
				.equalTo("isDefault", true)
				.first()
				.then(function(theme) {
					App.fn.findThemeBlocks(theme, function(blocks){
						App.fn.renderView({
							View: App.Views.EditPageBlocks,
							data: { 
								collection: blocks,
								theme: theme
							}
						});
					});
				});
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
		},

		edit: function(id) {
			var query = new Parse.Query(App.Models.Page);
			query.get(id).then(function(page){
				App.fn.renderView({
					View: App.Views.EditPageContent,
					data: { model: page }
				});
			});
		},

		page: function(id) {
			var query = new Parse.Query(App.Models.Page);
			query.get(id).then(function(page){
				App.fn.renderView({
					View: App.Views.Page,
					data: { model: page }
				});
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
				switch(options.type) {
					case 'model':
						data = this.model.toJSON();
						break;
					case 'collection':
						data = { items: this.collection.toJSON() };
						break;
				}
				data = _.extend({}, options.data, data);
				console.log(data);
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

			if (options.callback) options.callback(collection);
		});
	}

	App.fn.findThemeBlocks = function(theme, callback) {
		var Blocks = Parse.Collection.extend({
				model: App.Models.Block,
				query: (new Parse.Query(App.Models.Block)).equalTo('theme', theme)
			}),
			blocks = new Blocks();

			blocks.fetch({
				success: function(blocks) {
					callback(blocks);
				}
			});
	}

	App.fn.fetchBlocks = function(callback) {
		if (App.blocks.length === 0) {
			App.blocks.fetch().then(function(blocks) {
				App.blocks = blocks;
				callback();
			});
		} else {
			callback();
		}
	}

	App.fn.findaBlock = function(id, callback) {
		_.each(App.blocks.models, function(block){
			if (id === block.id) {
				callback(block);
			}
		})
	}

	App.fn.getBlocks = function(page, callback) {

		var blocks = [];

		App.fn.fetchBlocks(function(){

			_.each(page.blocks, function(b, i){

				App.fn.findaBlock(page.blocks[i].objectId, function(block){

					var jsonBlock = block.toJSON();

					// Update block content with page content
					if (page.blocks[i].fields) jsonBlock.content = page.blocks[i].fields;
					
					
					_.each(jsonBlock.fields.fields, function(field) {

						// Copy content into fields
						field.content = jsonBlock.content[field.key];

						// Make field types into binaries
						field.isTxt = false;
						field.isLongTxt = false;
						field.isImg = false;
						switch (field.type) {
							case "txt":
								field.isTxt = true;
								break;
							case "longtxt":
								field.isLongTxt = true;
								break;
							case "img":
								field.isImg = true;
								break;
						}
					});

					blocks.push(jsonBlock);

				});
			});

			callback(blocks);

		});
	}

	App.fn.renderBlocks = function(options) {

		var $container = options.$container || App.$app;

		App.$pageStyles.empty();

		_.each(options.blocks, function(block, i) {
			var $block = $('<section>')
							.addClass(block.objectId)
							.addClass(block.objectId + '-' + i)
							.appendTo($container),
				template = Handlebars.compile(block.html),
				content = options.content ? options.content[i] : block.content;

			$block.html(template(content));

			// TODO - Take out duplicates
			App.$pageStyles.append(block.css);
		});

	}

	App.start();

});