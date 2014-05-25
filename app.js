/******************************************************************************\



                                  DiscoChat



\******************************************************************************/
var expio    = require( 'express.io' ),
    request  = require( 'request'    ),
		crypto   = require( 'crypto/md5' ),
		timezone = require( 'timezoner'  ),
    Q        = require( 'q'          ),
    _        = require( 'underscore' ),
    mongoose = require( 'mongoose'   ),
    app      = expio(); // Start up Express.io

// Configure Express/Socket app
app.http().io();
app.use( expio.static( __dirname + '/public' ) );
app.use( expio.cookieParser() );
app.use( expio.session({ secret: 'dfvn23589e8fvihsk,j3rcmhrv^%hjvbdjhbv' }) );


// User Information Handlers

// Call this to fill out a profile based on an email only
var populateUserDetails = function( user ) {
  return Q.all([ getUserProfile( user ), getUserTimezone( user ) ]);
};

// Get a user's profile from Gravatar, based on email address
var getUserProfile = function( user ) {
  var defer = Q.defer(),
      hash  = crypto.hex_md5( user.email.trim().toLowerCase() ),
      url   = 'https://secure.gravatar.com/' + hash + '.json',
      opts  = {
        url: url,
        headers: {
          'User-Agent': 'DiscoChat/0.0.1' // User agent is required for Gravatar profiles requests
        }
      };
  request( opts, function( err, res, body ) {
    profile = JSON.parse( body );
    if ( profile && profile.entry ) {
      var p = profile.entry[0];
      user.name = ( p.displayName && p.displayName ) || user.email;
      user.picture = 'https://secure.gravatar.com/avatar/' + hash;
      defer.resolve();
    } else {
      defer.reject();
    }
  });

  return defer.promise;
};

// Use the Google Timezone API to figure out a user's local time
var getUserTimezone = function( user ) {
  var defer = Q.defer();

  timezone.getTimeZone(
    user.location[0],
    user.location[1],
    function( err, data ) {
      if ( !err && 'OK' === data.status ) {
        user.offset = data.rawOffset / 60 / 60; // hours
        defer.resolve();
      } else {
        defer.reject();
      }
    }
  );

  return defer.promise;
};


// Mongo Schemas
var userSchema = mongoose.Schema({
  room:     String,
  email:    String,
  name:     String,
  location: Array,
  picture:  String,
  offset:   Number,
  filled:   Boolean
});
userSchema.methods.getUsersInRoom = function( callback ) {
  return this
    .model( 'User' )
    .find({ room: this.room })
    .exec( callback );
};
userSchema.statics.getByEmail = function( room, email, callback ) {
  return this
    .model( 'User' )
    .find({ room: room, email: email })
    .limit( 1 )
    .exec( callback );
};
var User = mongoose.model( 'User', userSchema );

var chatSchema = mongoose.Schema({
  room:    String,
  utc:     Number,
  user:    mongoose.Schema.Types.Mixed, // Either an email, or a User Object
  message: String
});
chatSchema.methods.getRecent = function( num, callback ) {
  return this
    .model( 'Chat' )
    .find({ room: this.room })
    .sort( '-utc' )
    .limit( num )
    .exec( callback );
};
var Chat = mongoose.model( 'Chat', chatSchema );


// Connect to Mongo and then we're ready to party
mongoose.connect( 'mongodb://localhost/discochat' );
var db = mongoose.connection;
db.once( 'open', function() {
  // For all requests, send back our index
  app.all( '*', function( req, res ) {
    res.sendfile( __dirname + '/public/index.html' );
  });

  // Ready event sent when we know which room we want to connect to
  app.io.route( 'ready', function( req ) {
    console.log( 'Connected to: ' + req.data );
    req.session.room = req.data;
    req.io.join( req.session.room );

    // Load current members from Mongo and send them back to the connecting user
    var RoomUsers = new User({ room: req.session.room });
    RoomUsers.getUsersInRoom( function( err, data ) {
      _.each( data, function( user ) {
        req.io.emit( 'user', user );
      });
    } );

    // Load and send back previous 'x' chat messages for this room
    var RoomChats = new Chat({ room: req.session.room });
    RoomChats.getRecent( 100, function( err, data ) {
      _.each( data.reverse(), function( message ) {
        User.getByEmail( req.session.room, message.user, function( err, user ) {
          if ( user ) {
            message.user = user[0].toJSON();
            req.io.emit( 'message', message );
          }
        });
      });
    });
  });

  // Fires when a user has entered their email address/joined a room
  // Set up their user details, broadcast them to the room
  app.io.route( 'join', function( req ) {
    var user = req.data.user;
    req.session.user = user;

    // Try to populate user info if it's not available already
    if ( !user.filled ) {
      // Save in session, broadcast back out to everyone
      populateUserDetails( user ).done( function() {
        user.filled = true;
        req.session.save( function() {
          // Broadcast back out to room
          app.io.room( req.session.room ).broadcast( 'user', user );

          // Save to Mongo if not there already (based on email address)
          User.getByEmail( req.session.room, user.email, function( err, found ) {
            if ( !found.length ) {
              user.room = req.session.room;
              var thisUser = new User( user );
              thisUser.save();
            }
          });
        });
      });
    }
  });

  // Receive a message from a user and broadcast it back out to everyone in the room
  app.io.route( 'say', function( req ) {
    if ( '/' === req.data.message.substr( 0, 1 ) ) {
      // @todo Handle commands
    } else {
      // Broadcast to room
      var message = {
        message: req.data.message,
        user:    req.session.user,
        room:    req.session.room,
        utc:     Date.now()
      };
      app.io.room( req.session.room ).broadcast( 'message', message );

      // Save to Mongo so that new connections get old transcript
      message.user = message.user.email; // Just store the email so we can look it up later
      var thisChat = new Chat( message );
      thisChat.save();
    }
  });

  // When a user disconnects, let everyone in that room know
  app.io.route( 'disconnect', function( req ) {
    app.io.room( req.session.room ).broadcast( 'part', req.session.user );
    console.log( 'Client disconnected from ' + req.session.room );
  });


  // Grab port from env settings for Heroku; start it up
  var port = process.env.PORT || 8888;
  app.listen( port );
  console.log( 'DiscoChat accepting clients on http://localhost:' + port + '/' );
} );
