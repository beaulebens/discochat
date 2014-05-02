# DiscoChat

DiscoChat is a Node.js + Express + Socket.io (combined as Express.io) + Require.js + Backbone.js Javascript application, backed by a MongoDB database. It uses Leaflet.js for mapping, and a few other libraries where suitable.

## Architecture

The (Node.js) server code can be found in `app.js`.

The client app (loaded in the browser) is a Backbone.js and loads primarily from the skeleton file `index.html`. That uses Require.js to load other libraries as required. The core of the Backbone app is contained in `www/main.js`. Presentation is controlled via `www/style.css`, which is built from Sass files in `sass/`.

## App Flow

Users load the home URL, and a unique ID is generated for them, and appended to the URL. This becomes the identifier for their specific chat room. They then share that URL with other users who all end up in the same chat.

When a user accesses one of these specific chat URLs, they are asked for:

* Their Location via the HTML5 Location API
* Their email address (via a quick dialog)

Their details are sent to the Node.js server which uses their email to look up their Gravatar Profile, and their Location to look up their timezone. All of these details are compiled into a single user object which keeps track of them, and is broadcast back out to all connected clients.

Users all see a shared chat stream and a map which automatically keeps track of all of their locations + local times. As users enter/leave the room, the map will dynamically reposition itself.

## STILL TO COVER

* Backbone app files
* Command handling/creation
* Emoticons/substitutions
* Media handling (oEmbed + Drag/drop)
* MongoDB details
