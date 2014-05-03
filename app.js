/******************************************************************************\



                                  DiscoChat



\******************************************************************************/
var expio = require( 'express.io' ),
		app   = expio();
app.http().io();
app.use( expio.static( __dirname + '/www' ) );
app.use( expio.cookieParser() );
app.use( expio.session( { secret: 'dfvn23589e8fvihsk,j3rcmhrv^%hjvbdjhbv' } ) );

var request  = require( 'request'    ),
		crypto   = require( 'crypto/md5' ),
		timezone = require( 'timezoner'  ),
		moment   = require( 'moment'     );

// This is needed if the app is run on heroku
var port = process.env.PORT || 8888;

// For all requests, send back our index
app.all( '*', function( req, res ) {
	res.sendfile(__dirname + '/www/index.html');
});

// Ready event sent when we know which room we want to connect to
app.io.route( 'ready', function( req ) {
	console.log( 'Connected to: ' + req.data );

	// @todo Load current members from Mongo and send them back to the connecting user
	// @todo Load and send back previous 'x' chat messages (after users)

	req.io.join( req.data );
});

// Fires when a user has entered their email address/joined a room
// Set up their user details, broadcast them to the room
app.io.route( 'join', function( req ) {
	var user = req.data.user;

	// Try to populate my info if it's not available already
	var profile  = true;
	if ( !user.filled ) {
		// Request their profile from Gravatar
		var url = 'https://secure.gravatar.com/' + crypto.hex_md5( user.email.trim().toLowerCase() ) + '.json',
			opts = {
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
				user.picture = p.thumbnailUrl;

				// Re-broadcast
				app.io.room( req.data.room ).broadcast( 'user', user );
			}
		});

		// See if we can get their timezone from Google
		timezone.getTimeZone(
			user.location[0],
			user.location[1],
			function( err, data ) {
				if ( !err && 'OK' === data.status ) {
					user.offset = data.rawOffset / 60 / 60; // hours

					// Re-broadcast
					app.io.room( req.data.room ).broadcast( 'user', user );
				}
			}
		);

		// Avoid re-requesting this user in this session
		user.filled = true;
	}

	// Save in session, broadcast back out to everyone
	req.session.user = user;
	req.session.save( function() {
		app.io.room( req.data.room ).broadcast( 'user', user );
	});
});

// Receive a message from a user and broadcast it back out to everyone in the room
app.io.route( 'say', function( req ) {
	if ( '/' === req.data.message.substr( 0, 1 ) ) {
		// @todo Handle commands
		// var command = req.data.message.substr( 1 ).split( ' ' )[0],
		// 		commandHandler = new DiscoChat.CommandHandler( command, req );
		// CommandHandler.dispatch();
	} else {
		app.io.room( req.data.room ).broadcast( 'message', { message: req.data.message, user: req.data.who } );
	}
});

// When a user disconnects, let everyone in that room know
app.io.route( 'disconnect', function( req ) {
	// @todo remove them from Mongo? Use session to track who's who
	// app.io.room( req.data.room ).broadcast( 'user', user );
	console.log( 'Client disconnected' );
});

// Let's do this
app.listen( port );
console.log( 'DiscoChat accepting clients on http://localhost:' + port + '/' );
