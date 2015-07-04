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
			console.log(collection.blocks[0].img);
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

	App.Router = Parse.Router.extend({

		initialize: function(options){
			App.blocks = new App.Collections.Blocks();
			// BlogApp.blog = new BlogApp.Models.Blog();
			// BlogApp.blogs = new BlogApp.Collections.Blogs();
			// BlogApp.category = new BlogApp.Models.Category();
			// BlogApp.categories = new BlogApp.Collections.Categories();
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
			'new': 'new'
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

	App.start();

});