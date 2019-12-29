var express, app, server, io; //Network vars
const logTags = ['[INFO]', '[WARN]', '[ERROR]', '[ANTI-CHEAT]']; //Logger config
const logLvl = 0;
var loggerFileExists = false;

global.log = function(priority, txt) {
	if (priority >= logLvl) {
		var outTxt = logTags[priority] + ' ' + txt;
		switch (priority) {
			case 1:
				outTxt = outTxt.bgYellow;
				break;
			case 2:
				outTxt = outTxt.bgRed;
				break;
			case 3:
				outTxt = outTxt.bgCyan
				break;
		}
		var d = new Date;
		var t = '[' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds() + ']';
		console.log(t + outTxt);
	}
	if (!fs.existsSync('logs.txt')) {
		fs.writeFile('logs.txt', '--File created--', function(err) {
			loggerFileExists = true;
			log(0, 'Logger file created');
		});
	} else {
		fs.appendFile('logs.txt', t + logTags[priority] + ' ' + txt + '\n', (err) => {
			if (err) {
				log(2, err);
			}
		});
	}
} //Global log function
const useCommandLine = false; //Enables use of shutdown key
const tickLimiter = 1; //How often the network will update
const fs = require('fs');
const ipGetter = require('ip');
const colors = require('colors');
const msPerFrame = 1000 / 60;
log(0, '--Program start--');
const dataPaths = {
	guns: 'data/guns.json',
	maps: 'data/maps.json',
	items: 'data/items.json'
}
global.Guns = JSON.parse(safeLoadFile(dataPaths.guns)); //Load all the data files
global.Maps = JSON.parse(safeLoadFile(dataPaths.maps));
global.Items = JSON.parse(safeLoadFile(dataPaths.items));
const AC = require('./antiCheat.js'); //Load misc modules
const GameModes = require('./gamemodeLoader.js')();
const AIHandler = require('./AI.js');
log(0, 'Loaded gamemodes: ' + Object.getOwnPropertyNames(GameModes));
const rarityCounts = [10, 6, 2, 1]; //Raritys of each type of gun
const rarityColors = [
	[85, 85, 85, 255], //Commen
	[160, 25, 175, 255], //Rare
	[230, 165, 5, 255], //Legendary
	[255, 0, 0, 255], //Mythic
]; //Store colors of each rarity of gun
var connectedClients = 0; //Total connected clients
var prevItemPacket = []; //Last transmitted item packet
var prevPlayerPacket = []; //Last transmitted player packet
var hitsPacket = []; //Temp saves the bullets hitting players
var ids = []; //Stores all used id's to prevent conflicts
global.flatMap = []; //Stores the map in a 1d array
global.items = []; //All items (guns/items) to be picked up
global.players = []; //All connected player objects Instanceof Player
global.tick = 0; //Game tick
global.map = []; //Current game map, 2d array
global.gunPickList = []; //Stores all guns, number of entries based on rarity
global.itemPickList = []; //Stores all the items in array format
global.teams = []; //Existing teams {id:Number, color: Array}
global.state = 'lobby'; //Current state of the game
global.settings; //Stores the settings
global.settingTypes; //Defines what type of variable the settings will be
global.bh; //Stores the bullet handler object
var shutdownKey = 'q';
var curGm; //Current gamemode object
firstInitSettings();
//Change a letter within a string
String.prototype.setChar = function(pos, str) {
	return this.substring(0, pos) + str + this.substring(pos + str.length, this.length);
}

//Flatten an array
Array.prototype.flat = function(depth) {
	var flattend = [];
	(function flat(array, depth) {
		for (let el of array) {
			if (Array.isArray(el) && depth > 0) {
				flat(el, depth - 1);
			} else {
				flattend.push(el);
			}
		}
	})(this, Math.floor(depth) || 1);
	return flattend;
}

//Get a random element from an array
Array.prototype.random = function() {
	return this[Math.floor(Math.random() * this.length)];
}

//Get the distance between two points
Math.dist = function(x1, y1, x2, y2) {
	var a = x1 - x2;
	var b = y1 - y2;
	return Math.sqrt(a * a + b * b);
}

//Initalize the game settings
function firstInitSettings() {
	log(0, 'One time settings init called');
	settings = {
		tileSize: 30,
		playerSize: 20,
		dc: 0.85,
		map: Maps[0].map,
		mapInfo: Maps[0].data,
		wallsBreak: true,
		defaultGun: 'pistol',
		gamemode: '',
		killsToWin: 10,
		itemSpawnRates: 30,
		blockHP: 1000,
		spawnTime: 0,
		tickLimiter: tickLimiter,
		teamMode: false,
		teams: 0,
		lives: 0,
		numBots: 0,
		overrideEndGame: false,
	};
	settingTypes = {
		tileSize: 'unchange',
		playerSize: 'unchange',
		dc: 'number',
		map: 'unchange',
		mapInfo: 'unchange',
		wallsBreak: 'bool',
		teamMode: 'bool',
		defaultGun: Object.getOwnPropertyNames(Guns),
		gamemode: Object.getOwnPropertyNames(GameModes),
		killsToWin: ['1', '5', '10', '15', '25'],
		itemSpawnRates: 'number',
		blockHP: ['1', '100', '250', '500', '1000', '5000'],
		spawnTime: ['1', '3', '5', '10'],
		tickLimiter: 'unchange',
		teams: ['1', '2', '3', '4'],
		lives: ['0', '1', '2', '3', '5', '10'],
		numBots: ['0', '1', '2', '4', '8', '10'],
		overrideEndGame: 'unchange',
		isTypeList: true
	};
}

//Loads a file safly (Check if the file exists first)
function safeLoadFile(dir) {
	if (fs.existsSync(dir)) {
		log(0, 'Loaded: ' + dir);
		return fs.readFileSync(dir);
	} else {
		log(2, 'Unable to load: ' + dir);
		return '{}';
	}
}

//Binds a key that will shutdown the server
function bindShutdownKey(newShutdownKey) {
	shutdownKey = newShutdownKey;
	var stdin = process.stdin;
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding('utf8');
	stdin.on('data', function(key) {
		if (key === shutdownKey) {
			console.log('Shutdown key pressed');
			process.exit();
		}
		process.stdout.write(key);
	});
	log(0, 'Shutdown key set: ' + shutdownKey);
}

//Grabs a player object by id number
function getUserById(id) {
	var player = players.find(obj => obj.id == id);
	if (player) {
		return player;
	}
	log(2, 'No user could be found');
	return undefined;
}

//Grabs a player object by name
function getUserByName(name) {
	var player = players.find(obj => obj.name == name);
	if (player) {
		return player;
	}
	return {};
}

//Compares two objects to see if they are identical
Object.compare = function(obj1, obj2) {
	for (var p in obj1) {
		if (obj1.hasOwnProperty(p) !== obj2.hasOwnProperty(p)) return false;
		switch (typeof(obj1[p])) {
			case 'object':
				if (!Object.compare(obj1[p], obj2[p])) return false;
				break;
			case 'function':
				if (typeof(obj2[p]) == 'undefined' || (p != 'compare' && obj1[p].toString() != obj2[p].toString())) return false;
				break;
			default:
				if (obj1[p] != obj2[p]) return false;
		}
	}
	for (var p in obj2) {
		if (typeof(obj1[p]) == 'undefined') return false;
	}
	return true;
}

//Gets the map tile object at a point
function blockAt(x, y) {
	var nx = Math.floor(x / settings.tileSize);
	var ny = Math.floor(y / settings.tileSize);
	if (nx < 0 || ny < 0 || nx > map.length - 1 || ny > map[0].length - 1) {
		log(2, 'Map lookup out of bounds')
		return '';
	}
	if (!map[ny][nx]) {
		log(2, 'Map lookup had no data at point X: ' + nx + ' Y: ' + ny);
		return;
	}
	return map[ny][nx];
}

//Takes a text based map and converts it to a usable map
function parseMap(map) {
	var dataMap = [];
	log(0, 'New map parsed');
	for (var i = 0; i < map.length; i++) {
		dataMap.push([]);
		for (var i2 = 0; i2 < map[i].length; i2++) {
			var type = map[i][i2];
			var obj = {
				type: type,
				x: i2,
				y: i,
				canHaveGun: type == 'g',
				canHaveItem: type == 'i',
				canSpawnOn: type == 's',
				gun: undefined,
				item: undefined,
				hp: settings.blockHP
			};
			dataMap[i].push(obj);
		}
	}
	return dataMap;
}

//Handels the deletion of blocks once they take enough dmg
function delBlock(x, y) {
	map[y][x] = {
		type: '-',
		x: x,
		y: y,
		canHaveGun: false,
		canHaveItem: false,
		canSpawnOn: false,
		gun: undefined,
		item: undefined,
		hp: 100
	}
	settings.map[y] = settings.map[y].setChar(x, '-');
	sendToAll('game_event', {
		type: 'del_block',
		x: x,
		y: y
	});
}

//Checks if a point is within map bounderies
function isInBounds(x, y) {
	return x > settings.tileSize &&
		y > settings.tileSize &&
		x < (map[0].length - 1) * settings.tileSize &&
		y < (map.length - 1) * settings.tileSize;
}

//Handles all bullets
var BulletHandler = function(max) {
	this.maxBullets = max; //Max total bullets that can exist at once
	this.bullets = []; //All current bullets
	this.newBullets = []; //Any bullets that have spawned since the last network update
	this.run = function(players) {
		var hits = [];
		for (var i = 0; i < this.bullets.length; i++) {
			var b = this.bullets[i];
			var pHit = this.runBullet(b, players); //Runs the bullet and returns the hit
			//If got a hit formats the hit correctly and saves it to be sent at next network update
			if (pHit) {
				var gun = Guns[b.shotOutOf];
				var isHeadshot = Math.random() < gun.headshot;
				var hitData = {
					playerId: pHit.id,
					shotBy: b.shotBy,
					dmg: isHeadshot ? b.damage * 2 : b.damage,
					isHeadshot: isHeadshot,
					x: pHit.pos.x,
					y: pHit.pos.y
				};
				hits.push(hitData);
			}
		}
		//Finds all bullets that have died and prepars them to be transmitted
		var bDeaths = [];
		this.bullets.filter(bullet => bullet.dead).forEach(dBullet => {
			bDeaths.push(dBullet.id);
		});
		//Ensures bullet count does not exced maximum
		this.bullets = this.bullets.filter(bullet => !bullet.dead);
		if (this.bullets.length > this.maxBullets) {
			log(1, 'Too many bullets (' + this.bullets.length + '), deleting');
		}
		while (this.bullets.length > this.maxBullets) {
			this.bullets.shift();
		}
		//Formats all new bullets and sends it over network
		if (this.newBullets.length) {
			var d = new Date().getTime();
			this.newBullets.forEach(bul => bul.spawnedTime = d);
			sendToAll('game_event', {
				type: 'bullets',
				event: 'newBullet',
				bullets: this.newBullets
			});
			this.newBullets = [];
		}
		//Sends all bullet deaths over network
		if (bDeaths.length) {
			sendToAll('game_event', {
				type: 'bullets',
				event: 'deaths',
				ids: bDeaths
			});
		}
		return hits;
	}
	this.runBullet = function(bullet, players) {
		if (bullet.dead) {
			log(1, 'Uncleaned bullet found');
			return;
		}
		//Run the bullet step number of times for added simulation quality
		for (var i = 0; i < bullet.step; i++) {
			//Move the bullet based on velocity
			bullet.x += bullet.vx / bullet.step;
			bullet.y += bullet.vy / bullet.step;
			bullet.lt++;
			//Makes sure the bullet must be in bounds
			if (!isInBounds(bullet.x, bullet.y)) {
				bullet.dead = true;
				break;
			}
			//Check if the bullet hit a wall
			var block = blockAt(bullet.x, bullet.y);
			if (block.type == 'w' && bullet.hitsWalls) {
				bullet.dead = true;
				if (bullet.explosive) {
					this.exploadBullet(bullet);
				}
				blockDmg(block, bullet.damage)
				break;
			}
			//Check if the bullet has hit max dist or is out of bounds
			if (bullet.lt > bullet.lifeTime || !isInBounds(bullet.x, bullet.y)) {
				bullet.dead = true;
				if (bullet.explosive) {
					this.exploadBullet(bullet);
				}
				break;
			}
			//Calculates bullet collisions with players
			var closePlayers = players.filter(p => Math.dist(bullet.x, bullet.y, p.pos.x, p.pos.y) < settings.playerSize / 2 && !p.dead);
			if (settings.teamMode) {
				closePlayers = closePlayers.filter(p => p.team != bullet.team);
			}
			if (closePlayers.length > 0) {
				bullet.dead = true;
				if (bullet.explosive) {
					this.exploadBullet(bullet);
				}
				return closePlayers[0];
			}
		}
		return false;
	}
	//Handles explosive type bullets
	this.exploadBullet = function(bullet) {
		var gun = Guns[bullet.shotOutOf];
		var bSec = gun.bulletSecondary; //Gets properties of fragmentation
		if (!bSec) {
			log(2, 'No bullet secondary for explosive gun');
			return;
		}
		log(0, 'Exploading bullet');
		//Creates pellets number of fragmentation
		for (var i = 0; i < gun.pellets; i++) {
			var ang = randBetween(0, 360);
			ang *= Math.PI / 180;
			var pos = {
				x: bullet.x,
				y: bullet.y
			};
			var vel = {
				x: Math.cos(ang) * bSec.speed,
				y: Math.sin(ang) * bSec.speed
			};
			var newBul = {
				x: pos.x,
				y: pos.y,
				vx: vel.x,
				vy: vel.y,
				id: newID(false),
				damage: bSec.damage,
				team: '',
				lifeTime: bSec.lifeTime,
				step: bSec.step,
				explosive: false,
				fireTick: bSec.fireTick,
				shotOutOf: bullet.shotOutOf,
				hitsWalls: true,
				shotBy: bullet.shotBy,
				lt: 0,
				dead: false
			};
			this.bullets.push(newBul);
			this.newBullets.push(newBul);
		}
	}
	//Creates a new bullet at a player
	this.addBullet = function(player) {
		var gun = Guns[player.gun];
		if (!gun) {
			log(2, 'Player has unknown gun \'' + player.gun + '\'');
			return;
		}
		//Applys bullet spread
		var ang = player.rot + randBetween(-gun.spread / 2, gun.spread / 2);
		ang *= Math.PI / 180;
		//Shifts bullet to end of the gun barrel
		var pos = {
			x: player.pos.x + Math.cos(player.rot * Math.PI / 180) * gun.barrel.len,
			y: player.pos.y + Math.sin(player.rot * Math.PI / 180) * gun.barrel.len
		}
		if (!isInBounds(pos.x, pos.y)) {
			return;
		}
		//Spawns bullet
		var newBul = {
			x: pos.x,
			y: pos.y,
			vx: Math.cos(ang) * gun.bullet.speed,
			vy: Math.sin(ang) * gun.bullet.speed,
			id: newID(),
			damage: gun.bullet.damage,
			lifeTime: gun.bullet.lifeTime,
			step: gun.bullet.step,
			team: player.team,
			explosive: gun.bullet.explosive,
			fireTick: gun.bullet.fireTick,
			hitsWalls: gun.hitsWalls,
			shotOutOf: player.gun,
			shotBy: player.id,
			lt: 0,
			dead: false
		};
		this.bullets.push(newBul);
		this.newBullets.push(newBul);
	}
}

//Damages a block
function blockDmg(block, damage) {
	if (settings.wallsBreak) {
		block.hp -= damage;
		sendToAll('game_event', {
			type: 'block_dmg',
			block: block
		});
		if (block.hp <= 0) {
			delBlock(block.x, block.y);
		}
	}
}

//Creates the lists items and guns are choosen from
function setPicks() {
	gunPickList = [];
	itemPickList = [];
	log(0, 'Setting pick lists');
	for (var gun in Guns) {
		var g = Guns[gun];
		var rarity = rarityCounts[g.rarity];
		if (!rarity) {
			log(2, 'Rarity error setting GPL');
			continue;
		}
		if (!g.canSpawn) {
			log(0, g.name + ' can not spawn, skipping for GPL');
		} else {
			for (var i = 0; i < rarity; i++) {
				gunPickList.push(gun);
			}
		}
	}
	for (var item in Items) {
		itemPickList.push(item);
	}
}

//Gets random value from an array
function getRandomOf(arr) {
	if (arr.length == 0) {
		log(1, 'Empty array passed for getRandomOf');
	}
	return arr[Math.floor(Math.random() * arr.length)];
}

//Gets a player spawn point
function getPlayerSpawn(team) {
	var avPoints = flatMap.filter(tile => tile.canSpawnOn);
	if (avPoints.length < 1) {
		log(2, 'Could not find spawnable tile for player');
		return;
	}
	var point = getRandomOf(avPoints);
	log(0, 'Got player spawn {X: ' + point.x + ' Y: ' + point.y + '}');
	return point;
}

//Stupid function only needed due to scoping of setTimeout
function spawnPlayer(player) {
	player.spawn();
}

//Player object
var Player = function(conn) {
	this.pos = {
		x: 0,
		y: 0
	};
	this.vel = {
		x: 0,
		y: 0
	};
	this.rot = 0;
	this.conn = conn;
	this.dead = false;
	this.name = '';
	this.kills = 0;
	this.deaths = 0;
	this.isLoggedIn = false;
	this.bodyArmor = 1;
	this.hp = 0;
	this.isAi = false;
	this.id = conn.id;
	this.gun = 'pistol';
	this.isAdmin = false;
	this.team;
	this.canPickUp = true;
	this.spawnStatus = 'spawned';
	log(0, 'Creating player object');
	this.handleLife = function(data) {
		//Checks if the player wants to spawn, and if the player can spawn
		if (data.requestRespawn && this.spawnStatus != 'waiting') {
			if (this.deaths >= settings.lives && settings.lives > 0) {
				this.conn.emit('game_event', {
					type: 'set_state',
					state: 'spectator'
				});
				log(0, 'Player used all their lives, setting to spectator');
				return;
			}
			setTimeout(spawnPlayer, settings.spawnTime * 1000, this);
			this.spawnStatus = 'waiting';
			log(0, this.name + ' requested spawn');
		}
		this.hp = data.hp; //Change for anti-cheat system
		//if hp gets above 0 ensure the player is not dead
		if (this.hp > 0) {
			this.dead = false;
		}
		if (this.dead) {
			return false;
		}
		//When a players hp is <= 0 kill the player
		if (this.hp <= 0) {
			log(0, this.name + ' has died');
			callGamemode('onPlayerDie', this);
			this.deaths++;
			this.dead = true;
		}
		return true;
	}
	//Handles a game data event
	this.loadData = function(data) {
		if (this.handleLife(data)) {
			if (data.pickup) {
				this.pickupItem();
			}
			if (data.team) {
				this.team = data.team;
			}
			this.pos = data.pos || {
				x: this.pos.x,
				y: this.pos.y
			};
			this.vel = data.vel || {
				x: 0,
				y: 0
			};
			this.rot = data.rot || 0;
			if (data.bodyArmor) {
				this.bodyArmor = data.bodyArmor;
			}
		}
	}
	//Handles spawning of the player
	this.spawn = function(override) {
		var sp = getPlayerSpawn(this.team);
		log(0, 'Spawning player: ' + this.name);
		if (!this.dead && !override) {
			log(1, 'Non-dead player spawned (' + this.hp + ')');
		}
		this.dead = false;
		this.hp = 100;
		this.bodyArmor = 1;
		this.spawnStatus = 'spawned';
		this.gun = settings.defaultGun;
		callGamemode('onPlayerSpawn', this);
		this.conn.emit('game_event', {
			type: 'set_gun',
			gun: Guns[this.gun]
		});
		this.conn.emit('game_event', {
			type: 'spawn',
			x: (sp.x + 0.5) * settings.tileSize,
			y: (sp.y + 0.5) * settings.tileSize
		});
	}
	//Handles player item picking up
	this.pickupItem = function() {
		if (!this.canPickUp) {
			return;
		}
		var block = blockAt(this.pos.x, this.pos.y);
		if (block.gun) {
			this.gun = block.gun.item;
			items = items.filter(item => item.id != block.gun.id);
			block.gun = undefined;
			this.conn.emit('game_event', {
				type: 'set_gun',
				gun: Guns[this.gun]
			});
		}
		if (block.item) {
			this.conn.emit('game_event', {
				type: 'get_item',
				item: Items[block.item.item]
			});
			items = items.filter(item => item.id != block.item.id);
			block.item = undefined;
		}
	}
	//Returns only needed information about the player
	this.getForEmit = function() {
		return {
			id: this.id,
			pos: this.pos,
			vel: this.vel,
			rot: this.rot,
			name: this.name,
			dead: this.dead,
			team: this.team,
			kills: this.kills,
			isAdmin: this.isAdmin,
			bodyArmor: this.bodyArmor,
			gun: {
				barrel: this.gun && Guns[this.gun] ? Guns[this.gun].barrel : {}
			}
		}
	}
}

//Does what it says, spawns item (Can be gun or item)
function spawnItems() {
	//Spawn a gun
	var gun = getRandomOf(gunPickList);
	var point = getRandomOf(flatMap.filter(tile => tile.canHaveGun));
	if (!point || !gun) {
		log(2, 'Gun spawn error');
		return;
	} else if (!point.gun) {
		var gun = {
			x: point.x,
			y: point.y,
			item: gun,
			id: newID(false),
			c: rarityColors[Guns[gun].rarity],
			symbol: Guns[gun].symbol,
			type: 'gun'
		};
		items.push(gun);
		point.gun = gun;
	}
	//Spawn an item
	var item = getRandomOf(itemPickList);
	var point = getRandomOf(flatMap.filter(tile => tile.canHaveItem));
	// console.log(itemPickList,item,point);
	if (!point || !item) {
		log(2, 'Item spawn error');
		return;
	} else if (!point.item) {
		var item = {
			x: point.x,
			y: point.y,
			item: item,
			id: newID(false),
			c: [0, 0, 0, 255],
			symbol: Items[item].symbol,
			type: 'item'
		};
		items.push(item);
		point.item = item;
	}
}

//Genorates a new id
function newID(safe) {
	var id = Math.floor(Math.random() * 1e10);
	if (safe) {
		while (ids.indexOf(id) > -1) {
			id = Math.floor(Math.random() * 1e10)
		}
	}
	ids.push(id);
	return id.toString();
}

//Gets a random number between two values
function randBetween(min, max) {
	return Math.random() * (max - min + 1) + min;
}

//Send data to every connected player
global.sendToAll = function(event, data) {
	players.forEach(player => player.conn.emit(event, data));
}

//Starts the webserver
function initServer(ip, port) {
	express = require('express');
	app = express();
	server = app.listen(port, ip, serverInit);

	function serverInit() {
		var host = server.address().address;
		var port = server.address().port;
		console.log('Server Started: ' + host + ':' + port);
	}
	app.use(express.static('public'));
	io = require('socket.io')(server);
}

//Handles new player connection and syncs settings, teams, and possibly sets player to spectator
function initPlayer(socket) {
	console.log('New connection, %s clients connected', connectedClients);
	var newP = new Player(socket);
	players.push(newP);
	socket.emit('update_settings', settings);
	socket.emit('update_settings', settingTypes);
	socket.emit('game_event', {
		type: 'teams',
		teams: teams
	});
	socket.emit('game_event', {
		type: 'set_gun',
		gun: Guns[settings.defaultGun]
	});
	if (state == 'game') {
		socket.emit('game_event', {
			type: 'set_state',
			state: 'spectator'
		})
	}
}

//Updates players on user skins once they have set one
function updateSkins() {
	var skins = players.map(player => {
		return {
			skin: player.skin,
			id: player.id
		}
	});
	sendToAll('game_event', {
		type: 'skin_update',
		skins: skins
	});
}

//Updates a value of a user on their user account
function updateSaveAttr(user, attr, data) {
	log(0, 'Updating ' + user + '\'s ' + attr + ' value to: ' + data);
	var path = 'users/' + user + '.json';
	var curData = JSON.parse(fs.readFileSync(path));
	curData[attr] = data;
	fs.writeFileSync(path, JSON.stringify(curData));
}

//Grabs a value from a user account
function getSaveAttr(user, attr) {
	var path = 'users/' + user + '.json';
	var data = JSON.parse(fs.readFileSync(path));
	return data[attr];
}

//Handles all login events (Attempted login, new user)
function handleLogin(socket, data) {
	var path = 'users/' + data.user + '.json';
	if (data.isSkin) {
		var p = getUserById(socket.id);
		if (!p.isLoggedIn) {
			log(2, 'User uploaded skin before logging in');
			return;
		}
		updateSaveAttr(p.name, 'skin', data.skin);
		return;
	}
	if (data.newUser) {
		var newData = JSON.stringify({
			pass: data.pass
		});
		fs.writeFileSync(path, newData);
		console.log('New user has been created, \'%s\'', data.user);
		socket.emit('loginReturn', 'created_user');
	} else {
		var userExist = fs.existsSync(path);
		if (!userExist) {
			socket.emit('loginReturn', 'unknown_user');
			log(0, 'Unknown user, asking client if they want to create one');
		} else {
			var user = JSON.parse(fs.readFileSync(path));
			if (user.pass == data.pass) {
				log(0, 'User ' + data.user + ' has logged in');
				socket.emit('loginReturn', 'logged_in');
				var p = getUserById(socket.id);
				if (p) {
					p.isLoggedIn = true;
					p.name = data.user;
				} else {
					log(2, 'No user object exists when logging in');
				}
			} else {
				socket.emit('loginReturn', 'bad_password');
			}
		}
	}
}

//Loads new settings into the game
function loadSettings(data, override) {
	var prevSettings = jsonClone(settings);
	for (var i in settingTypes) {
		if ((settingTypes[i] != 'unchange' || override) && data.settings.hasOwnProperty(i)) {
			if (settings[i] != data.settings[i]) {
				settings[i] = data.settings[i];
				log(0, 'Setting: ' + i + ' updated to: ' + data.settings[i]);
			}
		}
	}
	if ((prevSettings.teams != settings.teams && settings.teamMode) ||
		prevSettings.teamMode != settings.teamMode) {
		initTeams(settings.teams);
	}
	if (prevSettings.gamemode != settings.gamemode) {
		loadGamemode(settings.gamemode);
	}
	if (prevSettings.numBots != settings.numBots) {
		AIHandler.init(settings.numBots, Player);
	}
	sendToAll('update_settings', settings);
}

//Initilizes a gamemode
function loadGamemode(modeName) {
	var newGm = GameModes[modeName];
	if (!newGm) {
		log(2, 'Unknown modeName: ' + modeName);
		return;
	}
	curGm = newGm;
	loadSettings({
		settings: curGm.settingsOverrides
	}, true);
	callGamemode('onPick');
}

//Safly calls a gamemode event (ensures that gamemode actually has said function)
function callGamemode(event, data) {
	if (!curGm || curGm.name == 'custom') {
		return;
	}
	if (typeof curGm[event] == 'function') {
		if (event != 'onTick' && event != 'checkGameEnd') {
			log(0, 'Called ' + curGm.name + '.' + event);
		}
		return curGm[event](data);
	}
}

//Handles all possible admin commands
function handleAdminCommand(socket, data) {
	var p = getUserById(socket.id);
	if (!p.isAdmin) {
		log(3, 'User sent admin command despite not being admin, ID: ' + p.id + ', Name: ' + p.name);
		return;
	}
	switch (data.command) {
		case 'start_game':
			startGame();
			break;
		case 'end_game':
			endGame();
			break;
		case 'new_settings':
			loadSettings(data);
			break;
		case 'set_team':
			var p = getUserById(data.playerId);
			if (!isPlayer(p)) {
				log(2, 'Unable to find ' + data.id + ' for player set team');
			}
			log(0, 'Setting players team via admin command');
			p.team = data.teamId;
			break;
		case 'kick':
			var p = getUserById(data.id);
			if (!isPlayer(p)) {
				log(2, 'Unable to find ' + data.id + ' for player kick');
			}
			p.conn.disconnect();
			log(0, 'Kicked player: ' + p.name);
			break;
		case 'set_map':
			var mIdx = 0;
			Maps.forEach((map, idx) => mIdx = map.data.id == data.id ? idx : mIdx);
			loadMap(Maps[mIdx]);
			break;
		default:
			log(2, 'User sent unknown admin command');
	}
}

//Clones an object using JSON
function jsonClone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

//Checks if an object is a player
function isPlayer(posPlayer) {
	return posPlayer instanceof Player;
}

//Loads a map from data
function loadMap(mapObj) {
	var mapObj = jsonClone(mapObj);
	log(0, 'Loading new map: ' + mapObj.data.name);
	settings.map = mapObj.map;
	settings.mapInfo = mapObj.data;
	map = parseMap(mapObj.map);
	flatMap = map.flat();
	AIHandler.initMap(map);
	sendToAll('update_settings', settings);
}

//Converts HSL to RGB value
function HSLToRGB(h, s, l) {
	s /= 100;
	l /= 100;
	var c = (1 - Math.abs(2 * l - 1)) * s,
		x = c * (1 - Math.abs((h / 60) % 2 - 1)),
		m = l - c / 2,
		r = 0,
		g = 0,
		b = 0;
	if (0 <= h && h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (60 <= h && h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (120 <= h && h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (180 <= h && h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (240 <= h && h < 300) {
		r = x;
		g = 0;
		b = c;
	} else if (300 <= h && h < 360) {
		r = c;
		g = 0;
		b = x;
	}
	r = Math.round((r + m) * 255);
	g = Math.round((g + m) * 255);
	b = Math.round((b + m) * 255);
	return [r, g, b];
};

//Creates new user teams
function initTeams(num) {
	log(0, 'Creating ' + num + ' teams');
	teams = [];
	for (var i = 0; i < num; i++) {
		teams.push({
			id: newID(false),
			// color: HSLToRGB(Math.random() * 360, Math.random() * 30 + 20, 70)
			color: [0, 0, 0].map(v => Math.random() * 255)
		});
	}
	players.forEach(player => player.team = undefined);
	sendToAll('game_event', {
		type: 'teams',
		teams: teams
	});
}

//Starts socket.io
function netInit() {
	io.sockets.on('connection', function(socket) {
		connectedClients++;
		initPlayer(socket); //Create player on connection
		//Game data gets loaded into player
		socket.on('game_data', function(data) {
			var p = getUserById(socket.id);
			if (!isPlayer(p)) {
				log(2, 'Game data without player object');
				return;
			}
			var acRet = AC.runPlayerData(p, data);
			if (acRet) {
				log.apply(null, acRet);
			}
			p.loadData(data);
		});
		//Shoot event called whenever a player wants to shoot
		socket.on('shoot', function(data) {
			var p = getUserById(socket.id);
			p.rot = data.r;
			var acLog = AC.runShoot(p, data);
			if (acLog) {
				log.apply(null, acLog);
				return;
			}
			p.pos.x = data.x;
			p.pos.y = data.y;
			bh.addBullet(p);
		});
		//Called when a player dies
		socket.on('death', function(data) {
			var p = getUserById(data);
			if (!p) {
				log(2, 'Invalid killer');
				return;
			}
			p.kills++;
		});
		//Handles requests for loading player skins
		socket.on('skin_event', function(data) {
			var p = getUserById(socket.id);
			if (!p.isLoggedIn) {
				log(2, 'Skin event attempted without being logged in');
			} else if (data.requestFromSave) {
				var skin = getSaveAttr(p.name, 'skin');
				p.skin = skin;
			} else {
				if (data.save) {
					updateSaveAttr(p.name, 'skin', data.skin);
				}
				p.skin = data.skin;
			}
			updateSkins();
		});
		socket.on('login', function(data) {
			handleLogin(socket, data)
		});
		socket.on('admin_command', function(data) {
			handleAdminCommand(socket, data);
		});
		//Handles users joining teams
		socket.on('join_team', function(data) {
			var p = getUserById(socket.id);
			p.team = data.id;
			log(0, 'Updated ' + p.name + '\'s team');
		});
		//Called whenever a user disconnects
		socket.on('disconnect', function(data) {
			connectedClients--;
			var p = getUserById(socket.id);
			callGamemode('onPlayerDc', p);
			players = players.filter(obj => obj.id != socket.id);
			console.log('Connection closed (%s), %s clients connected', p.name, connectedClients);
		});
		socket.on('chat', function(data) {
			socket.broadcast.emit('chat', data);
		});
		socket.on('self_report', function(data) {
			log(3, 'SREP: ' + data);
		});
		socket.on('ping_', function(data) {
			socket.emit('pong', data);
		});
	});
}

//Checks everything that needs to be synced and sends it
function updateNetwork() {
	if (hitsPacket.length > 0) {
		sendToAll('game_event', {
			type: 'hits',
			hits: hitsPacket
		});
		hitsPacket.forEach(hit => {
			var p = getUserById(hit.playerId);
			p.hp -= hit.dmg;
		});
		hitsPacket = [];
	}
	var needsItemUpdate = !Object.compare(items, prevItemPacket);
	var playersFormated = players.map(obj => obj.getForEmit());
	var jsonPlayers = JSON.stringify(playersFormated);
	var needsPlayerUpdate = jsonPlayers != prevPlayerPacket;
	if (needsPlayerUpdate || needsItemUpdate) {
		sendToAll('game_event', {
			type: 'game_data',
			players: needsPlayerUpdate || tick % 60 == 0 ? playersFormated : [],
			items: needsItemUpdate || tick % 60 == 0 ? items : []
		});
	}
	if (needsItemUpdate) {
		prevItemPacket = items;
		log(0, 'Updating items (' + items.length + ')');
	}
	if (needsPlayerUpdate) {
		prevPlayerPacket = jsonPlayers;
	}
}

//Initilizes the game
function startGame() {
	if (state == 'game') {
		log(2, 'Game already started');
	}
	state = 'game';
	if (settings.teamMode && players.filter(player => !player.team).length > 0) {
		log(0, 'Game init began, but stopped due to some players not having teams');
		return;
	}
	log(0, 'Game init started');
	items = [];
	bh = new BulletHandler(250);
	setPicks();

	var mIdx = 0;
	Maps.forEach((map, idx) => mIdx = map.data.id == settings.mapInfo.id ? idx : mIdx);
	loadMap(Maps[mIdx]);

	// AIHandler.init(settings.numBots, Player);
	players.forEach(player => player.spawn(true));
	players.forEach(p => p.canPickUp = true);
	callGamemode('onInit');
	sendToAll('update_settings', settings);
	sendToAll('game_event', {
		type: 'set_state',
		state: 'game'
	});
	log(0, 'Game started');
}

//Ends the game
function endGame() {
	state = 'lobby';
	players.forEach(player => player.kills = 0);
	sendToAll('game_event', {
		type: 'set_state',
		state: 'lobby'
	});
}

//Checks that there is only 1 admin, if more than one resets all admins, if less choooses one
function checkAdmin() {
	var uPlayers = players.filter(player => !player.isAi);
	if (uPlayers.length == 0) {
		return;
	}
	var adminNums = (uPlayers.filter(p => p.isAdmin)).length;
	if (adminNums == 0) {
		var p = uPlayers.random();
		if (!p) {
			return;
		}
		p.isAdmin = true;
		p.conn.emit('admin', {
			type: 'map_data',
			maps: Maps
		});
		log(0, 'Setting new admin to: ' + p.name);
	} else if (adminNums > 1) {
		log(2, 'Too many admins detected (' + adminNums + ')');
		uPlayers.forEach(p => p.isAdmin = false);
	}
}

var lastFrameTime = Date.now();

//Main function that is called 60x a second
function mainLoop() {
	checkAdmin();
	if (state == 'game') {
		if (bh) {
			//Saves all bullet hits
			var hits = bh.run(players);
			if (hits.length > 0) {
				hitsPacket = hitsPacket.concat(hits);
			}
		} else {
			//This code is only called when the bullethandler does not exist, shouldnt ever happen
			log(2, 'WHAT THE ACTUAL FUCK');
		}
		//Check if it time to spawn new items
		if (tick % settings.itemSpawnRates == 0) {
			spawnItems();
		}
		//Runs the ais
		AIHandler.run();
		//If there are few enough clients then end the game
		if (connectedClients == 0 || players.filter(p => p.isLoggedIn).length == 0) {
			log(0, 'Game ending due to lack of players');
			endGame();
		}
		if (!settings.overrideEndGame) {
			//Ends game based off player kills
			players.forEach(player => {
				if (player.kills >= settings.killsToWin) {
					log(0, 'Game ending due to number of kills');
					endGame();
				}
			});
		} else {
			//Uses gamemode checkGameEnd function to see if game should end
			if (callGamemode('checkGameEnd')) {
				log(0, 'Game ending due to gamemode function');
				endGame();
			}
		}
		callGamemode('onTick');
	}
	if (tick % tickLimiter == 0) {
		updateNetwork();
	}
	tick++;
	var d = Date.now();
	var dt = d - lastFrameTime;
	lastFrameTime = d;
	if (dt > msPerFrame * 1.5) {
		log(1, 'Server running at ' + dt + 'ms per frame');
	}
}

//Called once when the server first starts up.  Starts everything
function startServer() {
	if ((process.argv[2] == 'help' || !process.argv[2]) && useCommandLine) {
		console.log('node index.js {local,online} [shutdownKey] [port]');
		process.exit(0);
	}
	var local = process.argv[2] == 'local';
	var shutdownK = process.argv[3] || 'q';
	var port = process.argv[4] || 8000;
	if (local) {
		initServer('localhost', port);
	} else {
		var ip = ipGetter.address();
		console.log('Connect to: http://' + ip + ':8000/');
		initServer(ip, port);
	}
	if (useCommandLine) {
		bindShutdownKey(shutdownK);
	}
	netInit();
	Maps.forEach(map => map.data.id = newID(false));
	log(0, 'Map id\'s set');
	loadMap(Maps[0]);
	setInterval(mainLoop, msPerFrame);
}
startServer();