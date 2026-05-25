$(function() {
	// Supabase client — kept for auth, block uploads, and best-effort page sync.
	// Primary data source is now local JSON files + localStorage.
	var supabase = window.supabase.createClient(
		'https://cvdglclcryqdchgdqlmx.supabase.co',
		'sb_publishable_shhKnTSQFE6-a2bXUGj6iw_clyHbXp7'
	);

	var App = new (Backbone.View.extend({

		Models: {},
		Views: {},
		query: {},
		fn: {},
		localData: { blocks: [], themes: [], types: [] },

		start: function() {
			this.$app = this.$el.find('#app');
			this.router = new this.Router;
			this.router.start();
		}

	}))({el: document.body});

	// =========================================================
	// Local JSON data loading — static data lives in data/*.json
	// =========================================================

	App.fn.initLocalData = function() {
		return $.when(
			$.getJSON('data/blocks.json').done(function(d) { App.localData.blocks = d || []; }),
			$.getJSON('data/themes.json').done(function(d) { App.localData.themes = d || []; }),
			$.getJSON('data/types.json').done(function(d) { App.localData.types = d || []; }),
			$.getJSON('data/pages.json').done(function(d) {
				_.each(d || [], function(page) {
					if (!App.fn.localPages.get(page.id)) {
						App.fn.localPages.save(page.id, page);
					}
				});
			})
		);
	};

	// =========================================================
	// Local page storage — pages live in localStorage
	// =========================================================

	App.fn.localPages = {
		_key: 'premade_pages',
		all: function() {
			try { return JSON.parse(localStorage.getItem(App.fn.localPages._key) || '{}'); }
			catch(e) { return {}; }
		},
		get: function(id) {
			return App.fn.localPages.all()[id] || null;
		},
		save: function(id, data) {
			var pages = App.fn.localPages.all();
			if (!id) {
				id = 'p_' + Date.now();
			}
			pages[id] = _.extend({}, pages[id] || {}, data, { id: id });
			localStorage.setItem(App.fn.localPages._key, JSON.stringify(pages));
			return pages[id];
		}
	};

	// =========================================================
	// Local query builder — same chainable interface as the old
	// Supabase wrapper but reads from App.localData.
	// Returns jQuery Deferred promises so .then() still works.
	// =========================================================

	App.fn.localQuery = function(tableName) {
		var _filters = [];
		var _order = null;

		var q = {
			eq: function(col, val) {
				_filters.push({ col: col, val: val });
				return q;
			},
			order: function(col, opts) {
				_order = { col: col, opts: opts || {} };
				return q;
			},
			_run: function() {
				var data = (App.localData[tableName] || []).slice();
				_.each(_filters, function(f) {
					data = _.filter(data, function(row) { return String(row[f.col]) === String(f.val); });
				});
				if (_order) {
					data = _.sortBy(data, _order.col);
					if (_order.opts && _order.opts.ascending === false) { data = data.reverse(); }
				}
				return data;
			},
			find: function() {
				return $.Deferred().resolve(q._run()).promise();
			},
			first: function() {
				return $.Deferred().resolve(q._run()[0] || null).promise();
			},
			get: function(id) {
				var found = _.find(App.localData[tableName] || [], function(row) {
					return String(row.id) === String(id);
				}) || null;
				return $.Deferred().resolve(found).promise();
			}
		};
		return q;
	};

	// =========================================================
	// Supabase query builder — kept for admin writes only
	// =========================================================

	App.fn.supaQuery = function(table) {
		var _table = table;
		var _filters = [];
		var _order = null;

		var q = {
			eq: function(col, val) {
				_filters.push({ col: col, val: val });
				return q;
			},
			order: function(col, opts) {
				_order = { col: col, opts: opts || {} };
				return q;
			},
			find: function() {
				var query = supabase.from(_table).select();
				_.each(_filters, function(f) { query = query.eq(f.col, f.val); });
				if (_order) { query = query.order(_order.col, _order.opts); }
				return query.then(function(result) {
					if (result.error) { console.log(result.error); return []; }
					return result.data;
				});
			},
			first: function() {
				var query = supabase.from(_table).select();
				_.each(_filters, function(f) { query = query.eq(f.col, f.val); });
				if (_order) { query = query.order(_order.col, _order.opts); }
				return query.limit(1).single().then(function(result) {
					if (result.error) { console.log(result.error); return null; }
					return result.data;
				});
			},
			get: function(id) {
				return supabase.from(_table).select().eq('id', id).single()
					.then(function(result) {
						if (result.error) { console.log(result.error); return null; }
						return result.data;
					});
			}
		};
		return q;
	};

	// =========================================================
	// Data helper functions
	// =========================================================

	App.fn.blockPreProcess = function(blockId, data) {
		data.type_id = data.type;
		data.theme_id = data.theme;
		data.content = data.content ? JSON.parse(data.content) : {};
		data.fields = data.fields ? JSON.parse(data.fields) : {};
		delete data.type;
		delete data.theme;

		supabase.auth.getUser().then(function(resp) {
			data.user_id = resp.data.user ? resp.data.user.id : null;

			if (data.file) {
				App.fn.uploadAsBlockPreview(data, blockId);
			} else {
				delete data.file;
				App.fn.blockSave(blockId, data);
			}
		});
	};

	App.fn.blockSave = function(blockId, data) {
		var query;
		if (blockId) {
			query = supabase.from('blocks').update(data).eq('id', blockId).select();
		} else {
			query = supabase.from('blocks').insert(data).select();
		}
		query.then(function(result) {
			if (result.error) { console.log(result.error); }
			else { console.log(result.data[0]); }
		});
	};

	// Pages saved to localStorage first; Supabase gets a best-effort sync.
	App.fn.pageSave = function(pageId, data, callback) {
		var page = App.fn.localPages.save(pageId, data);
		callback(page);

		var q = pageId
			? supabase.from('pages').update(data).eq('id', pageId).select()
			: supabase.from('pages').insert(_.extend({}, data, { id: page.id })).select();
		q.then(null, function(e) { console.log('Supabase page sync skipped:', e); });
	};

	App.fn.imageUpload = function(file, callback) {
		var fileName = Date.now() + '_' + file.name;
		var storagePath = 'images/' + fileName;

		supabase.storage.from('uploads').upload(storagePath, file, {
			contentType: file.type
		}).then(function(uploadResult) {
			if (uploadResult.error) { console.log(uploadResult.error); return; }

			var publicUrl = supabase.storage.from('uploads').getPublicUrl(storagePath).data.publicUrl;

			return supabase.auth.getUser().then(function(userResp) {
				return supabase.from('images').insert({
					url: publicUrl,
					storage_path: storagePath,
					uploader_id: userResp.data.user ? userResp.data.user.id : null
				}).select();
			});
		}).then(function(result) {
			if (result && result.data) {
				callback(result.data[0]);
			}
		});
	};

	App.fn.uploadAsBlockPreview = function(data, blockId) {
		App.fn.imageUpload(data.file, function(img) {
			data.img_id = img.id;
			data.img_url = img.url;
			delete data.file;
			App.fn.blockSave(blockId, data);
		});
	};

	// =========================================================
	// Views
	// =========================================================

	App.Views.Landing = Backbone.View.extend({

		template: Handlebars.compile($('#landing-tpl').html()),

		render: function(){
			this.$el.html(this.template());
		}

	});

	App.Views.EditPageBlocks = Backbone.View.extend({

		template: Handlebars.compile($('#page-edit-tpl').html()),

		className: 'container-fluid page-edit',

		events: {
			'mouseenter .theme-curr': 'showSide2',
			'mouseleave .theme-curr': 'hideSide2',
			'mouseenter .side-2': 'showSide2',
			'mouseleave .side-2': 'hideSide2',
			'click .theme': 'changeTheme',
			'click .generate': 'generatePage'
		},

		render: function() {

			var self = this;

			if (!self.model) {
				self.getDefaultTheme();
				return;
			}

			self.page = self.model.json;

			App.fn.findBlock(self.page.blocks[0].blockId, function(block) {
				var theme = _.find(App.localData.themes, function(t) {
					return String(t.id) === String(block.theme_id);
				}) || null;
				self.loadPage(theme);
			});

		},

		getDefaultTheme: function() {
			var self = this;
			var theme = _.find(App.localData.themes, function(t) { return t.is_default; }) || null;
			self.loadPage(theme);
		},

		loadPage: function(theme) {

			var self = this;

			self.currTheme = theme;

			App.fn.findThemeBlocks(self.currTheme, function(blocks) {

				self.collection = blocks;
				self.$el.html(self.template(self.currTheme));

				self.loadThemes();
				self.loadBlocks(self.collection);

				if (self.page) {
					self.loadExistingBlocks(self.page);
				}
			});
		},

		loadThemes: function() {
			var self = this;
			App.fn.loadComponent({
				collection: App.query.themes,
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
				collection: App.query.types,
				$container: self.$el.find('.types'),
				View: App.fn.generateView({
					templateId: '#page-edit-types',
					type: 'collection',
					tagName: 'ul'
				}),
				callback: function(types) {
					_.each(self.blocks, function(block, i) {
						self.$el.find('[id="' + block.id + '"]').appendTo(self.$el.find('[id="' + block.type_id + '"]'));
					});
					_.each(self.$el.find('.blocks'), function(block, i) {
						if ($(block).find('.block').length === 0) {
							$(block).parent().hide();
						}
					});
				}
			});
		},

		changeTheme: function(e) {
			var self = this,
				id = $(e.target).closest('.theme').data('id');

			if (String(id) === String(self.currTheme && self.currTheme.id)) { return; }

			var theme = _.find(App.localData.themes, function(t) { return String(t.id) === String(id); }) || null;
			if (!theme) { return; }

			self.currTheme = theme;
			App.fn.findThemeBlocks(theme, function(blocks) {
				self.loadBlocks(blocks);
			});
			self.$el.find('.theme-curr-name').html(theme.name);
		},

		loadExistingBlocks: function(page) {

			var self = this;
				template = Handlebars.compile($('#page-edit-blocks-with-content').html());

			App.fn.getBlocks(page, function(blocks) {

				_.each(blocks, function(block, i){
					block.content = JSON.stringify(page.blocks[i].content);
				});

				self.$el.find('.preview-list').append(template({
					items: blocks
				}));

			});
		},

		generatePage: function() {

			var self = this,
				$blocks = self.$el.find('.preview-list .block'),
				page = {};

				page.blocks = [];

				_.each($blocks, function($b, i){
					page.blocks[i] = {
						blockId: $blocks.eq(i).data('id'),
						content: $blocks.eq(i).data('content')
					};
				});

			if (page.blocks.length === 0) {
				alert('You need a least one block to generate a page!');
				return;
			}

			if (self.page) {
				App.fn.pageSave(self.model.id, { json: page }, function(page) {
					App.router.navigate('#/edit/' + page.id, {trigger: true});
				});
			} else {
				App.fn.renderView({
					View: App.Views.EditPageContent,
					data: { model: page }
				});
			}
		},

		showSide2: function() {
			this.$el.find('.side-2').addClass('show');
		},

		hideSide2: function() {
			this.$el.find('.side-2').removeClass('show');
		},

		enableDrag: function(){

			var $del = this.$el.find('.delete');

			this.$el.find('.side .block').draggable({
				helper: 'clone',
				appendTo: '.preview-list',
				connectToSortable: '.preview-list'
			});

			this.$el.find('.preview-list').droppable({
				accept: '.side .block',
				greedy: false
			}).sortable({
				appendTo: '.preview-list',
				placeholder: "preview-placeholder",
				activate: function(event, ui) {
					$del.show();
				},
				deactivate: function(event, ui) {
					$del.hide();
					ui.item.css('z-index', 0);
				}
			});

			this.$el.find('.delete').droppable({
				accept: '.preview-list .block',
				over: function(event, ui) {
					$(this).addClass('active');
				},
				out: function(event, ui) {
					$(this).removeClass('active');
				},
				drop: function(event, ui) {
					ui.draggable.eq(0).remove();
					$(this).removeClass('active').hide();
				}
			});
		}

	});

	App.Views.EditPageContent = Backbone.View.extend({

		template: Handlebars.compile($('#content-edit-tpl').html()),

		className: 'container-fluid page-edit page-edit-content',

		events: {
			'focus .field': 'focusField',
			'blur .field': 'blurField',
			'change .field': 'changeField',
			'click .publish': 'publishPage',
			'click .back': 'backToBlocks'
		},

		focusField: function(e) {

			var self = this,
				$e = $(e.target),
				block = $e.closest('.edit-block').data('id'),
				field = $e.data('key'),
				$field = this.$el.find('.preview-html .block-' + block + ' .' + field);

			$field.addClass('special-highlight');
		},

		blurField: function(e) {

			var self = this,
				$e = $(e.target),
				block = $e.closest('.edit-block').data('id'),
				field = $e.data('key'),
				$field = this.$el.find('.preview-html .block-' + block + ' .' + field);

			$field.removeClass('special-highlight');

		},

		changeField: function(e) {

			var self = this,
				$e = $(e.target),
				index = $e.closest('.edit-block').data('index'),
				block = $e.closest('.edit-block').data('id'),
				field = $e.data('key'),
				type = $e.data('type'),
				val = $e.val(),
				$field = this.$el.find('.preview-html .block-' + block + ' .' + field);

			switch (type) {
				case 'txt':
					$field.html(val);
					self.blocks[index].content[field] = val;
					break;
				case 'longtxt':
					$field.html(val);
					self.blocks[index].content[field] = val;
					break;
				case 'img':
					App.fn.imageUpload($e[0].files[0], function(img){
						val = img.url;
						$field.attr('src', val);
						self.blocks[index].content[field] = val;
					});
					break;
				case 'bgimg':
					App.fn.imageUpload($e[0].files[0], function(img){
						val = img.url;
						$field.css('background-image', 'url(' + val + ')');
						self.blocks[index].content[field] = val;
					});
					break;
			}
		},

		savePage: function(navs) {
			var self = this,
				json = {};

			json.blocks = [];

			_.each(self.blocks, function(block){

				var newBlock = {};

				newBlock.blockId = block.id;
				newBlock.content = block.content;

				json.blocks.push(newBlock);

			});

			App.fn.pageSave(self.model.id || null, { json: json }, function(page) {
				self.model = page;
				_.each(navs, function(nav, i){
					App.router.navigate('#/' + nav.url + '/' + page.id, {trigger: nav.trigger});
				});
			});
		},

		publishPage: function() {
			this.savePage([
				{
					'url': 'build',
					'trigger': false
				}, {
					'url': 'edit',
					'trigger': false
				}, {
					'url': 'page',
					'trigger': true
				}
			]);
		},

		backToBlocks: function() {
			this.savePage([
				{
					'url': 'build',
					'trigger': true
				}
			]);
		},

		render: function() {
			var self = this,
				page;

			if (self.model.id && self.model.json) {
				page = self.model.json;
			} else {
				page = self.model;
			}

			App.fn.getBlocks(page, function(blocks) {

				self.$el.html(self.template({
					blocks: blocks
				}));

				App.fn.renderBlocks({
					blocks: blocks,
					$container: self.$el.find('.preview-html')
				});

				self.blocks = blocks;

				if (!self.model.id) {
					self.$el.find('.back').hide();
				}
			});

		}

	});

	App.Views.Page = Backbone.View.extend({

		render: function() {

			var self = this,
				page;

			if (self.model) {
				page = self.model.json;
			} else {
				page = self.options.page;
			}

			App.fn.getBlocks(page, function(blocks){
				App.fn.renderBlocks({
					blocks: blocks,
					$container: self.$el
				});
			});

		}
	});

	App.Views.Login = Backbone.View.extend({

		template: Handlebars.compile($('#login-tpl').html()),

		events: {
			'submit .login-form': 'login'
		},

		login: function(e) {
			e.preventDefault();

			var data = $(e.target).serializeArray(),
				email = data[0].value,
				password = data[1].value;

			supabase.auth.signInWithPassword({
				email: email,
				password: password
			}).then(function(result) {
				if (result.error) {
					alert(result.error.message);
				} else {
					Backbone.history.navigate('#/dev', { trigger: true });
				}
			});

		},

		render: function(){
			this.$el.html(this.template());
		}
	});

	App.Views.Dev = Backbone.View.extend({

		template: Handlebars.compile($('#dev-tpl').html()),

		render: function(){
			this.$el.html(this.template());
		}

	});

	App.Views.UpdateBlock = Backbone.View.extend({

		template: Handlebars.compile($('#update-block-tpl').html()),

		events: {
			'submit .update-block-form': 'submit'
		},

		submit: function(e){
			e.preventDefault();
			var blockId = this.model ? this.model.id : null;
			App.fn.blockPreProcess(blockId, {
				type:		this.$el.find('.update-block-type select').val(),
				theme:		this.$el.find('.update-block-theme select').val(),
				name:		this.$el.find('#update-block-name').val(),
				file:		this.$el.find('#update-block-file')[0].files[0],
				html:		this.$el.find('#update-block-html').val(),
				css:		this.$el.find('#update-block-css').val(),
				content:	this.$el.find('#update-block-content').val(),
				fields:		this.$el.find('#update-block-fields').val()
			});
		},

		render: function(){

			var self = this;

			self.$el.html(self.template());

			App.fn.loadComponent({
				collection: App.query.types,
				View: App.Views.Select,
				$container: self.$el.find('.update-block-type'),
				data: {
					label: 'Type',
					field: 'type'
				}
			});

			App.fn.loadComponent({
				collection: App.query.themes,
				View: App.Views.Select,
				$container: self.$el.find('.update-block-theme'),
				data: {
					label: 'Theme',
					field: 'theme'
				}
			});
		}

	});

	App.Views.Select = Backbone.View.extend({

		template: Handlebars.compile($('#select-tpl').html()),

		render: function(){
			var data = {
				items: this.collection,
				label: this.options.label,
				field: this.options.field
			};
			this.$el.html(this.template(data));
		}
	});

	// =========================================================
	// Router
	// =========================================================

	App.Router = Backbone.Router.extend({

		initialize: function(options){

			App.$pageStyles = $('#page-styles');

			// Use local JSON data for all read queries
			App.query.blocks = App.fn.localQuery('blocks');
			App.query.types = App.fn.localQuery('types').order('order');
			App.query.themes = App.fn.localQuery('themes').eq('is_live', true);
		},

		start: function(){
			Backbone.history.start({root: '/'});
		},

		routes: {
			'': 'landing',
			'new': 'new',
			'build/:id': 'build',
			'edit/:id': 'edit',
			'page/:id': 'page',
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
			App.fn.renderView({
				View: App.Views.EditPageBlocks
			});
		},

		build: function(id) {
			var page = App.fn.localPages.get(id);
			App.fn.renderView({ View: App.Views.EditPageBlocks, data: { model: page } });
		},

		edit: function(id) {
			var page = App.fn.localPages.get(id);
			if (!page) { Backbone.history.navigate('#/new', { trigger: true }); return; }
			App.fn.renderView({ View: App.Views.EditPageContent, data: { model: page } });
		},

		page: function(id) {
			var page = App.fn.localPages.get(id);
			if (!page) { Backbone.history.navigate('#/new', { trigger: true }); return; }
			App.fn.renderView({ View: App.Views.Page, data: { model: page } });
		},

		login: function() {
			App.fn.renderView({
				View: App.Views.Login
			});
		},

		dev: function() {
			App.fn.checkLogin(function(user) {
				App.fn.renderView({
					View: App.Views.Dev,
					data: { model: user }
				});
			});
		},

		addBlock: function() {
			App.fn.checkLogin(function() {
				App.fn.renderView({
					View: App.Views.UpdateBlock,
				});
			});
		},

	});

	// =========================================================
	// Utility functions
	// =========================================================

	App.fn.checkLogin = function(callback) {
		supabase.auth.getUser().then(function(resp) {
			if (!resp.data.user) {
				Backbone.history.navigate('#/login', { trigger: true });
			} else {
				if (callback) callback(resp.data.user);
			}
		});
	};

	App.fn.generateView = function(options) {
		return Backbone.View.extend({
			template: Handlebars.compile($(options.templateId).html()),
			tagName: options.tagName || 'div',
			className: options.className || null,
			render: function() {
				var data;
				switch(options.type) {
					case 'model':
						data = this.model;
						break;
					case 'collection':
						data = { items: this.collection };
						break;
				}
				data = _.extend({}, options.data, data);
				this.$el.html(this.template(data));
			}
		});
	};

	App.fn.renderView = function(options) {
		var View = options.View,
			data = options.data || null,
			$container = options.$container || App.$app,
			notInsert = options.notInsert,
			view = new View(data);
		view.options = _.extend({}, view.options, data);
		view.render();
		if (notInsert) {
			return view.el.outerHTML;
		} else {
			$container.html(view.el);
		}
	};

	App.fn.loadComponent = function(options) {

		options.collection.find().then(function(collection){

			var data = {collection: collection};
			data = _.extend({}, options.data, data);

			App.fn.renderView({
				View: options.View,
				$container: options.$container,
				data: data
			});

			if (options.callback) options.callback(collection);
		});

	};

	App.fn.findThemeBlocks = function(theme, callback) {
		if (!theme) { callback(App.fn.localQuery('blocks').eq('is_live', true)); return; }
		callback(App.fn.localQuery('blocks').eq('theme_id', theme.id).eq('is_live', true));
	};

	App.fn.fetchThemes = function(callback) {
		if (!App.themes) {
			App.query.themes.find().then(function(themes) {
				App.themes = themes;
				callback();
			});
		} else {
			callback();
		}
	};

	App.fn.fetchBlocks = function(callback) {
		if (!App.blocks) {
			App.query.blocks.find().then(function(blocks) {
				App.blocks = blocks;
				callback();
			});
		} else {
			callback();
		}
	};

	App.fn.findBlock = function(id, callback) {
		App.fn.fetchBlocks(function(){
			_.each(App.blocks, function(block){
				if (String(id) === String(block.id)) {
					callback(block);
				}
			});
		});
	};

	App.fn.getBlocks = function(page, callback) {

		var blocks = [];

		App.fn.fetchBlocks(function(){

			_.each(page.blocks, function(b) {

				App.fn.findBlock(b.blockId, function(block) {

					var jsonBlock = {
						id: block.id,
						content: block.content,
						html: block.html,
						css: block.css,
						fields: block.fields,
						theme: { id: block.theme_id },
						img_url: block.img_url,
					};

					if (b.content) jsonBlock.content = b.content;

					_.each(jsonBlock.fields.fields, function(field) {

						field.content = jsonBlock.content[field.key];

						field.isTxt = false;
						field.isLongTxt = false;
						field.isImg = false;
						switch (field.type) {
							case 'txt':
								field.isTxt = true;
								break;
							case 'longtxt':
								field.isLongTxt = true;
								break;
							case 'img':
								field.isImg = true;
								break;
							case 'bgimg':
								field.isImg = true;
								break;
						}
					});

					blocks.push(jsonBlock);

				});
			});

			callback(blocks);

		});
	};

	App.fn.renderBlocks = function(options) {

		var $container = options.$container || App.$app,
			html = '',
			style = {
				themes: [],
				blocks: []
			};

		_.each(options.blocks, function(block, i) {

			var themeId = block.theme.id,
				blockId = block.id,
				$block = $('<section>')
							.addClass('theme-' + themeId)
							.addClass('block-' + blockId)
							.addClass('block-' + blockId + '-' + i),
				template = Handlebars.compile(block.html),
				content = options.content ? options.content[i] : block.content;

			$block.html(template(content));
			html += $block[0].outerHTML;

			if (style.blocks.indexOf(blockId) === -1) {
				style.blocks.push(i);
			}

			if (style.themes.indexOf(themeId) === -1) {
				style.themes.push(themeId);
			}

		});

		$container.append(html);

		App.fn.getCSS(options.blocks, style);

	};

	App.fn.getCSS = function(blocks, style) {

		var css = '';

		App.fn.fetchThemes(function() {

			_.each(style.themes, function(themeId, i) {

				theme = App.themes.filter(function(t){
					return String(t.id) === String(themeId);
				})[0];

				css += theme.css;
			});

			_.each(style.blocks, function(num, i) {
				css += blocks[num].css;
			});

			App.$pageStyles.html(css);
		});

	};

	// =========================================================
	// Boot: load local JSON data (blocks, themes, types, pages),
	// seed legacy pages into localStorage, then start the app.
	// =========================================================
	App.fn.initLocalData().always(function() {
		App.start();
	});

});
