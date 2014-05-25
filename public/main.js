var DiscoChat = DiscoChat || {};

// Core

// Each user ("me" or otherwise)
DiscoChat.Person = ( function( $, Backbone ) {
  return Backbone.Model.extend({
    defaults: function() {
      return {
        email    : '',
        name     : '',
        location : [], // lat,long
        picture  : '', // URL
        offset   : '', // hours +/- UTC
        filled   : false
      };
    }
  });
})( jQuery, Backbone );

// All people in this room
DiscoChat.People = ( function( $, Backbone ) {
  return Backbone.Collection.extend({
    model: DiscoChat.Person
  });
})( jQuery, Backbone );

// Core application logic
DiscoChat.App = ( function( $, Backbone, _ ) {
  return Backbone.Router.extend({
    initialize: function( options ) {
      console.log( 'App:initialize' );
      this.io       = options.io; // required
      this.room     = this.getRoom();
      this.me       = options.me     || new DiscoChat.Person( { room: this.room } );
      this.people   = options.people || new DiscoChat.People( [ this.me ] );
      this.messages = options.messages || new DiscoChat.Messages();
      this.map = new DiscoChat.MapView({
        el:     '#dc-map',
        me:     this.me,
        people: this.people,
      });
      this.chat = new DiscoChat.ChatStreamView({
        el:       '#dc-chat',
        io:       this.io,
        me:       this.me,
        room:     this.room,
        messages: this.messages,
        people:   this.people
      });
      window.history.pushState( '', 'DiscoChat', '/' + this.room );

      // Connect to room and render everyone
      this.io.emit( 'ready', this.room );

      // Listen for changes to me, and send them to the server
      this.listenTo( this.me, 'change', this.sendMeToServer );

      // Listen for incoming data and handle it
      var that = this;
      this.io.on( 'user', function( data ) {
        that.addPerson( data );
      });

      this.io.on( 'message', function( data ) {
        that.addMessage( data );
      });
    },

    addPerson: function( person ) {
      console.log( 'App:addPerson' );
      var found = this.people.findWhere({ email: person.email });
      if ( found ) {
        console.log( ' - Found ' + found.get( 'email' ) );
        found.set( person );
      } else {
        console.log( ' - Add new ' + person.email );
        this.people.add( person, { merge: true });
      }
    },

    addMessage: function( message ) {
      console.log( 'App:addMessage' );
      this.messages.add( message );
    },

    getRoom: function( options ) {
      console.log( 'App:getRoom' );
      // Check for room id in URL
      // URL parsing-technique from http://tutorialzine.com/2013/07/quick-tip-parse-urls/
      var url  = $( '<a>', { href: document.location.href })[0];
      var path = url.pathname.split( '/' );
      path.shift(); // Get rid of the first one, which is always empty

      var room;
      if ( path.length === 1 && '' === path[0] ) {
        // Generate a room and add it to the url
        room = this.randomStr( 32 ); // md5-sh
      } else {
        room = path[0];
      }
      return room;
    },

    // @source: http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
    randomStr: function( m ) {
      var s = '', r = '1234567890abcdef'; // generate md5-ish strings
      for ( var i = 0; i < m; i++ ) {
        s += r.charAt( Math.floor( Math.random() * r.length ) );
      }
      return s;
    },

    sendMeToServer: function( event ) {
      console.log( 'App:sendMeToServer' );
      // Send "Me" to the server if an email is set
      if ( this.me.get( 'email' ).length ) {
        console.log( ' - sending ' + this.me.get( 'email' ) );
        this.io.emit( 'join', {
          user: this.me.toJSON()
        });
      }
    },

    start: function( options ) {
      console.log( 'App:start' );
      this.map.render();

      // If we don't know who this is yet, let's ask
      if ( ! this.me.get( 'email' ).length ) {
        Backbone.trigger( 'disable-app' );
        new DiscoChat.GreetView({ el: $( '#dc-greet' ), me: this.me }).render();
      }
    }
  });
})( jQuery, Backbone, _ );

// Main map view
DiscoChat.MapView = ( function( $, Backbone, _ ) {
  return Backbone.View.extend({
    id: 'dc-map',

    initialize: function( options ) {
      console.log( 'MapView:initialize' );
      this.me      = options.me;
      this.people  = options.people;
      this.markers = [];

      // Set up listeners
      this.listenTo( Backbone,    'disable-app', this.disableApp );
      this.listenTo( Backbone,    'enable-app',  this.enableApp  );
      this.listenTo( this.people, 'add',         this.redrawMap  );
      this.listenTo( this.people, 'remove',      this.redrawMap  );
      this.listenTo( this.people, 'change',      this.redrawMap  );
      this.listenTo( this.me,     'change',      this.redrawMap  );
    },

    disableApp: function() {
      console.log( 'MapView:disableApp' );
      this.$el.addClass( 'disabled' );
    },

    enableApp: function() {
      console.log( 'MapView:enableApp' );
      this.$el.removeClass( 'disabled' );
    },

    mapMarker: function( user ) {
      return new L.HtmlIcon({
          html:  '<div class="map-marker"><img src="' + user.get( 'picture' ) + '?s=120" border="0" />',
          title: user.get( 'name' )
      });
    },

    redrawMap: function() {
      // return; // @todo Crashes GMaps; need to wait for location?
      console.log( 'MapView:redrawMap' );
      var bounds = [],
          that = this;

      // Remove markers, so we can re-draw them all
      // @todo diff the arrays instead of complete re-draw?
      _.each( this.markers, function( marker ) {
        that.map.removeLayer( marker );
      });
      this.markers = [];

      this.people.each( function( person ) {
        if ( ! person || !person.get( 'location' ) || !person.get( 'location' )[0] ) {
          return;
        }

        console.log( ' - ' + person.get( 'location' )[0] + ', ' + person.get( 'location' )[1] );

        // Create a point for their location
        var point = new L.LatLng( person.get( 'location' )[0], person.get( 'location' )[1] );
        bounds.push( point );

        // Create custom marker (pin + gravatar)
        var marker = new L.marker( point, {
          title: person.get( 'name' ),
          icon: that.mapMarker( person )
        }).addTo( that.map );
        that.markers.push( marker );

        // Create window to attach to marker
        // var infoWin = new google.maps.InfoWindow({
        //   content: person.get( 'name' ),
        //   position: point,
        //   pixelOffset: new google.maps.Size( 0, 0 ),
        //   maxWidth : 300
        // });
      });

      // Now fit the bounds of all points into the map (if there are any)
      if ( bounds.length ) {
        this.map.fitBounds( bounds, {
          paddingBottomRight: [ 400, 0 ]
        } );
      }
    },

    updateMyLocation: function( lat, long ) {
      console.log( 'MapView:updateMyLocation' );
      this.me.set({ location: [ lat, long ] });
      this.redrawMap();
    },

    handleLocation: function( loc, fail ) {
      console.log( 'MapView:handleLocation' );
      if ( ! fail ) {
        // Store reference to my location and update map
        this.updateMyLocation( loc.coords.latitude, loc.coords.longitude );

        // Now watch for refinements to location and send updates to the server (and update position)
        /*
        navigator.geolocation.watchPosition( function( loc ) {
          this.updateMyLocation( loc.coords.latitude, loc.coords.longitude );
        }
        */
      }
    },

    drawOverlay: function() {
      console.log( 'MapView:drawOverlay' );
      this.overlay = L.terminator().addTo( this.map );
    },

    updateOverlay: function() {
      var t2 = L.terminator();
      this.overlay.setLatLngs( t2.getLatLngs() );
      this.overlay.redraw();
    },

    render: function() {
      console.log( 'MapView:render' );
      // Set up the map and center it on 0,0 for now
      this.map = L.map( this.id, {
        center: [ 0, 0 ],
        zoom: 13
      });

      L.tileLayer('http://openmapsurfer.uni-hd.de/tiles/roads/x={x}&y={y}&z={z}', {
        attribution: 'Imagery from <a href="http://giscience.uni-hd.de/">GIScience Research Group @ University of Heidelberg</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        detectRetina: true
      }).addTo( this.map );

      var that = this;

      // Draw the overlay now, and schedule it to redraw periodically
      this.drawOverlay();
      this.redrawOverlay = setInterval( function() {
        that.updateOverlay();
      }, 10000 );

      // Kick off a request to try to get the viewing user's location
      navigator.geolocation.getCurrentPosition( function( loc, fail ) {
        that.handleLocation( loc, fail );
      });

      return this;
    }
  });
})( jQuery, Backbone, _ );

DiscoChat.GreetView = ( function( $, Backbone, _ ) {
  return Backbone.View.extend({
    initialize: function( options ) {
      console.log( 'GreetView:initialize' );
      this.me = options.me;
    },

    events: {
      'click #submit': 'updateMyEmail'
    },

    updateMyEmail: function( event ) {
      console.log( 'GreetView:updateMyEmail' );
      event.preventDefault();

      // Get email and clear the form
      var $email = this.$( '#email' );
      this.me.set({ email: $email.val() });
      $email.val( '' );

      this.remove();
      Backbone.trigger( 'enable-app' );
    },

    render: function( options ) {
      console.log( 'GreetView:render' );
      this.$el.show();
      this.$( '#email' ).focus();
      return this;
    }
  });
})( jQuery, Backbone, _ );


// Map

// PersonMarkerView -- the pins on the map
DiscoChat.PersonMarkerView = ( function( $, Backbone, _, moment ) {
  return Backbone.View.extend({
    model: DiscoChat.Person,

    render: function( options ) {
      return this;
    }
  });
})( jQuery, Backbone, _, moment );


// Chat

// PersonChatView -- what a user looks like in chats

// Message -- the model for a single chat message
DiscoChat.Message = ( function( $, Backbone, _, moment ) {
  return Backbone.Model.extend({
    defaults: function() {
      return {
        utc: new moment(),
        user: null, // null indicates a "system" message
        message: ''
      };
    }
  });
})( jQuery, Backbone, _, moment );

// Messages -- Collection of Message models
DiscoChat.Messages = ( function( $, Backbone ) {
  return Backbone.Collection.extend({
    model: DiscoChat.Message,

    comparator: function( a, b ) {
      return a.get( 'utc' ) > b.get( 'utc' );
    }
  });
})( jQuery, Backbone );

// MessageView -- individual chat messages
DiscoChat.MessageView = ( function( $, Backbone, _, moment, Handlebars ) {
  return Backbone.View.extend({
    model: DiscoChat.Message,

    className: 'dc-message',

    template: Handlebars.compile,

    initialize: function( options ) {
      console.log( 'MessageView:initialize' );
      this.me = options.me;
    },

    render: function( options ) {
      console.log( 'MessageView:render' );
      var htmlTemplate = '#dc-chat-message';
      if ( this.model.get( 'user' ) === null ) {
        // System message
        htmlTemplate = '#dc-system-message';
        this.$el.addClass( 'system' );
      } else if ( this.me.get( 'email' ) === this.model.get( 'user' ).email ) {
        // Add a class if this was my own message
        this.$el.addClass( 'me' );
      }

      var message = this.model.toJSON(),
          template = this.template( $( htmlTemplate ).html() );

      this.$el.html( template({ data: message }) );

      var that = this;
      this.$( '.moment' ).each( function( index ) {
        $( this ).html( moment( $( this ).data( 'moment' ) ).fromNow() );
      });

      return this;
    }
  });
})( jQuery, Backbone, _, moment, Handlebars );


// ChatStreamView -- the entire chat stream, made up of a series of ChatMessageViews
DiscoChat.ChatStreamView = ( function( $, Backbone, _ ) {
  return Backbone.View.extend({
    collection: DiscoChat.Messages,

    initialize: function( options ) {
      console.log( 'ChatStreamView:initialize' );
      this.io         = options.io;
      this.me         = options.me;
      this.people     = options.people;
      this.room       = options.room;
      this.collection = options.messages;

      this.listenTo( Backbone,        'enable-app',  this.focusChat        );
      this.listenTo( Backbone,        'enable-app',  this.enableApp        );
      this.listenTo( Backbone,        'enable-app',  this.joinMessage      );
      this.listenTo( Backbone,        'disable-app', this.disableApp       );
      this.listenTo( this.collection, 'add',         this.renderMessage    );
      this.listenTo( this.people,     'add',         this.joinMessage      );

      var that = this;
      this.io.on( 'part', function( data ) {
        that.partMessage( data );
      });

      setInterval( function() {
        that.$( '.moment' ).each( function( index ) {
          $( this ).html( moment( $( this ).data( 'moment' ) ).fromNow() );
        });
      }, 15000 );
    },

    events: {
      'keydown': 'maybePostMessage'
    },

    disableApp: function() {
      console.log( 'ChatStreamView:disableApp' );
      this.$el.addClass( 'disabled' );
    },

    enableApp: function() {
      console.log( 'ChatStreamView:enableApp' );
      this.$el.removeClass( 'disabled' );
    },

    focusChat: function( e ) {
      this.$( '#message' ).focus();
    },

    scrollToBottom: function() {
      this.$( '#log' ).animate({
        scrollTop: $( '#log' )[0].scrollHeight
      }, 500 );
    },

    joinMessage: function( person ) {
      if ( this.$el.hasClass( 'disabled' ) ) {
        return;
      }
      var name = 'You';
      if ( person ) {
        name = person.get( 'name' );
        if ( !name.length ) {
          name = 'Someone';
        }
      }
      var message = new DiscoChat.Message({
            message: name + ' joined the chat.' // @todo i18n
          }),
          messageView = new DiscoChat.MessageView({
            model: message,
            me: this.me
          });
      this.$( '#log' ).append( messageView.render().$el );
      this.scrollToBottom();
    },

    partMessage: function( data ) {
      var name = data.name;
      if ( !name.length )
        name = 'Someone';
      var message = new DiscoChat.Message({
            message: name + ' disconnected.' // @todo i18n
          }),
          messageView = new DiscoChat.MessageView({
            model: message,
            me: this.me
          });
      this.$( '#log' ).append( messageView.render().$el );
      this.scrollToBottom();
    },

    maybePostMessage: function( e ) {
      if ( 13 === e.keyCode && '' !== this.$( '#message' ).val().trim() ) {
        e.preventDefault();
        this.postMessage();
      }
    },

    postMessage: function( e ) {
      console.log( 'ChatStreamView:postMessage' );
      var message = this.$( '#message' ).val();
      this.$( '#message' ).val( '' );
      message = new DiscoChat.Message({ message: message });
      this.io.emit( 'say', message );
    },

    renderMessage: function( message, options ) {
      console.log( 'ChatStreamView:renderMessage' );

      // @todo Check this against the last one, and if they're by the same person,
      // then render this one into the end of the other, rather than doing a whole new thing.

      var messageView = new DiscoChat.MessageView({
        model: message,
        me:    this.me
      });
      this.$( '#log' ).append( messageView.render().$el );

      if ( 'undefined' == typeof options.scroll || true === options.scroll ) {
        this.scrollToBottom();
      }

      return this;
    },

    render: function( options ) {
      // Render any messages we have
      _.each( this.collection, function( message ) {
        this.renderMessage( message );
      });

      // Scroll to the bottom
      this.scrollToBottom();

      // Focus the chat box
      this.focusChat();

      return this;
    }
  });
})( jQuery, Backbone, _ );
