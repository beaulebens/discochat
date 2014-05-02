var MapChat = MapChat || {};

// Core

// Each user ("me" or otherwise)
MapChat.Person = ( function( $, Backbone ) {
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

// All people on this URL
MapChat.People = ( function( $, Backbone ) {
  return Backbone.Collection.extend({
    model: MapChat.Person
  });
})( jQuery, Backbone );

// Core application logic
MapChat.App = ( function( $, Backbone, _ ) {
  return Backbone.Router.extend({
    initialize: function( options ) {
      console.log( 'App:initialize' );
      this.io     = options.io; // required
      this.me     = options.me     || new MapChat.Person();
      this.people = options.people || new MapChat.People( [ this.me ] );
      this.room   = this.getRoom();
      this.map    = new MapChat.MapView({
        me:     this.me,
        people: this.people,
        el:     '#mc-map'
      });
      window.history.pushState( '', 'MapChat', '/' + this.room );

      // Connect to room and render everyone
      this.io.emit( 'ready', this.room );

      // Listen for changes to me, and send them to the server
      this.listenTo( this.me, 'change', this.sendMeToServer );

      // Listen for incoming data and handle it
      var that = this;
      this.io.on( 'user', function( data ) {
        that.addPerson( data );
      });
    },

    addPerson: function( person ) {
      console.log( 'App:addPerson' );
      var found = this.people.findWhere( { email: person.email } );
      if ( found ) {
        console.log( ' - Found ' + found.get( 'email' ) );
        found.set( person );
      } else {
        console.log( ' - Add new ' + person.email );
        this.people.add( person, { merge: true } );
      }
    },

    getRoom: function( options ) {
      console.log( 'App:getRoom' );
      // Check for room id in URL
      // URL parsing-technique from http://tutorialzine.com/2013/07/quick-tip-parse-urls/
      var url  = $( '<a>', { href: document.location.href } )[0];
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
      for ( var i = 0; i < m; i++ ) { s += r.charAt( Math.floor( Math.random() * r.length ) ); }
      return s;
    },

    sendMeToServer: function( event ) {
      console.log( 'App:sendMeToServer' );
      // Send "Me" to the server if an email is set
      if ( this.me.get( 'email' ).length ) {
        console.log( ' - sending ' + this.me.get( 'email' ) );
        this.io.emit( 'join', {
          user: this.me.toJSON(),
          room: this.room
        });
      }
    },

    start: function( options ) {
      console.log( 'App:start' );
      this.map.render();

      // If we don't know who this is yet, let's ask
      if ( ! this.me.get( 'email' ).length ) {
        Backbone.trigger( 'disable-app' );
        new MapChat.GreetView( { el: $( '#mc-greet' ), me: this.me } ).render();
      }
    }
  });
})( jQuery, Backbone, _ );

// Main map view
MapChat.MapView = ( function( $, Backbone, _ ) {
  return Backbone.View.extend({
    id: 'mc-map',

    initialize: function( options ) {
      console.log( 'MapView:initialize' );
      this.me     = options.me;
      this.people = options.people;

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

    redrawMap: function() {
      console.log( 'MapView:redrawMap' );
      var bounds = new google.maps.LatLngBounds(),
          that = this;
      this.people.each( function( person ) {
        if ( ! person ) {
          return;
        }

        console.log( ' - ' + person.get( 'location' )[0] + ', ' + person.get( 'location' )[1] );

        // Create a point for their location
        var point = new google.maps.LatLng( person.get( 'location' )[0], person.get( 'location' )[1] );

        // Create custom marker (pin + gravatar)
        var marker = new google.maps.Marker({
          position: point,
          map: that.map,
          title: person.get( 'name' )
        } );

        // Create window to attach to marker
        // var infoWin = new google.maps.InfoWindow({
        //   content: person.get( 'name' ),
        //   position: point,
        //   pixelOffset: new google.maps.Size( 0, 0 ),
        //   maxWidth : 300
        // } );

        // Extend the bounds of our map to include this point
        bounds.extend( point );
      });

      // Now fit the bounds of all points into the map (if there are any)
      if ( ! bounds.isEmpty() ) {
        this.map.fitBounds( bounds );
      }
    },

    updateMyLocation: function( lat, long ) {
      console.log( 'MapView:updateMyLocation' );
      this.me.set( { location: [ lat, long ] } );
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

    drawOverlay: function( map ) {
      console.log( 'MapView:drawOverlay' );
      map = map || this.map;
      // @todo This reduces the flash of "white", but we still get a pulsing effect during redraw
      $( '#mc-overlay' ).fadeOut( 'fast', function() { this.remove(); } );
      this.overlay = new DayNightOverlay( { map: map, id: 'mc-overlay' } );
    },

    render: function() {
      console.log( 'MapView:render' );
      // Set up the map and center it on 0,0 for now
      var mapOptions = {
        center: new google.maps.LatLng( 0, 0 ),
        zoom: 2
      };
      this.map = new google.maps.Map( document.getElementById( this.id ), mapOptions );

      var that = this;

      // Draw the overlay now, and schedle it to redraw periodically to
      // keep it moving on open sessions.
      this.drawOverlay();
      this.redrawOverlay = setInterval( function() {
        that.drawOverlay();
      }, 600000 );

      // Immediately kick off a request to try to get the viewing user's location
      // @uses var that from above
      // @todo Refine position by monitoring changes?
      navigator.geolocation.getCurrentPosition( function( loc, fail ) {
        that.handleLocation( loc, fail );
      });

      return this;
    }
  });
})( jQuery, Backbone, _ );

MapChat.GreetView = ( function( $, Backbone, _ ) {
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
      this.me.set( { email: $email.val() } );
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
MapChat.PersonMarkerView = ( function( $, Backbone ) {
  return Backbone.View.extend({

  });
})( jQuery, Backbone );


// Chat

// PersonChatView -- what a user looks like in chats

// ChatMessageView -- individual chat messages

// ChatStreamView -- the entire chat stream, made up of a series of ChatMessageViews
// @todo listenTo backbone and focus the chat when app is enabled
// @todo listenTo people collection and post a message when someone is added to it (joins) or departs
