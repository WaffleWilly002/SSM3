var fRate = 60;
var socket;
var keys = [];
var textBoxes = [];
var oldData = {};
var matchedCache = [];
var bullets = [];
var items = [];
var hasPrevConnected = false;
var name = '';
var state = 'login';
var afterLoginState = 'lobby';
var drawHB = false;
var loginText = -1;
var lastFrameRate = 0;
var map;
var bloodHandler;
var players = [];
var allPlayers = [];
var teams = [];
var mouseUp = true;
var allMaps = [];
var skins = [];
var chat = [];
var settings = {
	playerSize: 20,
	tileSize: 30,
	dc: 0.85,
};
var settingTypes = {}
var gamePacket = {};
var canv;
var buttonSpacer = 10;
var makeActive = '';
var gHash = '';
var Overlay = function(r, g, b, rate) {
	this.col = {
		r: r,
		g: g,
		b: b,
		a: 0
	};
	this.rate = rate;
	this.run = function() {
		this.col.a -= this.rate;
		this.col.a = constrain(this.col.a, 0, 255);
		fill(this.col.r, this.col.g, this.col.b, this.col.a);
		// console.log(this.col.levels);
		rect(-10, -10, windowWidth + 20, windowHeight + 20);
	}
	this.trigger = function(alpha) {
		this.col.a = alpha || 255;
	}
}
var overlays = [];
var cam = {
	x: 0,
	y: 0,
	xOff: 0,
	yOff: 0,
	xWant: 0,
	yWant: 0,
	speed: 0.9,
	run: function(x, y) {
		this.setTarget(x, y);
		this.x = lerp(this.x, this.xWant, this.speed);
		this.y = lerp(this.y, this.yWant, this.speed);
		translate(this.x + this.xOff, this.y + this.yOff);
	},
	setOffset: function(xOffset, yOffset) {
		this.xOff = xOffset;
		this.yOff = yOffset;
	},
	setTarget: function(x, y) {
		this.xWant = x;
		this.yWant = y;
	}
}
const msPerFrame = 1000 / fRate;
var chatFadeTime = 60 * 10;
var lastZoom = 1;
var zoomStateSaver = 'login';
var lastFrameTime = Date.now();
var dt = 0;
var curPing = 50;
var pingRet = true;
const pingRate = 15;

function k(k) {
	return keys[k.toUpperCase().charCodeAt(0)];
}

function setTextActive() {
	textBoxes[makeActive].active = true;
}

function getUserById(id) {
	var player = players.filter(obj => obj.id == id);
	if (player.length == 1) {
		return player[0];
	}
	log(2, 'No user could be found');
	return {};
}

function initNet() {
	socket = io.connect(getURL().substring(7, getURL().length - 1));
	socket.on('connect', function() {
		console.log('Connected');
		hasPrevConnected = true;
		player.id = socket.id;
		socket.on('update_settings', function(data) {
			if (data.isTypeList) {
				settingTypes = data;
			} else {
				if (settings.gamemode != data.gamemode) {
					initGamemode(data.gamemode);
				}
				settings = data;
				map.setTs(settings.tileSize);
				map.set(settings.map);
			}
		});
		socket.on('admin', function(data) {
			switch (data.type) {
				case 'map_data':
					allMaps = data.maps;
					break;
				default:
					'Unknown admin command';
			}
		});
		socket.on('loginReturn', function(data) {
			switch (data) {
				case 'unknown_user':
					loginText = 0;
					break;
				case 'bad_password':
					loginText = 1;
					break;
				case 'created_user':
					loginText = 2;
					break;
				default:
					console.log('Now logged in');
					state = afterLoginState;
					textBoxes = [];
					textBoxes['chat'] = new InputFeild(15, windowHeight - 40, 200, 25, {
						trigger: function() {
							socket.emit('chat', name + ': ' + this.input);
							chat.push({
								txt: 'You: ' + this.input,
								t: 0
							});
							this.input = '';
							this.active = false;
						},
						sanitize: true
					});
			}
		});
		socket.on('game_event', function(data) {
			switch (data.type) {
				case 'set_gun':
					player.setGun(data.gun);
					gHash = sha256(JSON.stringify(data.gun));
					break;
				case 'game_data':
					if (data.players.length) {
						allPlayers = data.players;
						players = data.players.filter(obj => obj.id != socket.id);
					}
					if (data.items.length) {
						items = data.items;
					}
					break;
				case 'bullets':
					// bullets = data.bullets;
					if (data.event == 'newBullet') {
						data.bullets.forEach(bullet => {
							var deltaT = curPing / 2; //Assume 50ms of delay
							bullet.x += bullet.vx * (deltaT / msPerFrame);
							bullet.y += bullet.vy * (deltaT / msPerFrame);
						});
						bullets = bullets.concat(data.bullets);
					} else {
						bullets = bullets.filter(bullet => !data.ids.includes(bullet.id));
					}
					break;
				case 'spawn':
					player.respawn(data.x, data.y);
					break;
				case 'hits':
					data.hits.forEach(hit => {
						if (hit.playerId == socket.id) {
							player.takeDmg(hit);
						} else {
							bloodHandler.newBlood(hit.x, hit.y, hit.dmg);
						}
					});
					break;
				case 'get_item':
					player.getItem(data.item);
					break;
				case 'set_state':
					if (state == 'login') {
						console.log('Net state update qued: %s', data.state);
						afterLoginState = data.state;
					} else {
						console.log('Net state update: %s -> %s', state, data.state);
						if (data.state == 'game' && isAdmin) {
							for (var i in settings) {
								if (settingTypes[i] == 'number') {
									delete textBoxes[i];
								}
							}
						}
						state = data.state;
					}
					break;
				case 'skin_update':
					skins = data.skins;
					break;
				case 'block_dmg':
					map.tileDmg(data.block);
					break;
				case 'del_block':
					map.setBlock(data.x, data.y, '-');
					break;
				case 'teams':
					if (JSON.stringify(teams) != JSON.stringify(data.teams) && data.teams) {
						teams = data.teams;
						player.team = undefined;
						socket.emit('join_team', {
							id: undefined
						});
						console.log('Updated teams');
					}
					break;
				default:
					console.log('We got a wak input from the network', data);
			}
		});
		socket.on('chat', function(data) {
			chat.push({
				txt: data,
				t: 0
			});
		});
		socket.on('pong', function(data) {
			pingRet = true;
			curPing = Date.now() - data;
		});
	});
}

function isEqual(obj1, obj2) {
	if (!obj1 && !obj2) {
		return true;
	}
	if (!obj1 || !obj2) {
		return false;
	}
	for (var i in obj1) {
		if (obj1[i] != obj2[i]) {
			return false;
		}
	}
	return true;
}
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

function isEmpty(obj) {
	if (!obj) {
		return true;
	}
	return Object.entries(obj).length == 0 && obj.constructor == Object;
}

function runNetwork() {
	if (state == 'discon' || frameCount % settings.tickLimiter) {
		return;
	}
	var newPacket = {
		pos: {
			x: player.pos.x,
			y: player.pos.y
		},
		vel: {
			x: player.vel.x,
			y: player.vel.y
		},
		rot: player.rot,
		team: player.team,
		hp: player.hp,
		bodyArmor: player.bodyArmor,
		requestRespawn: gamePacket.requestRespawn || false,
		pickup: gamePacket.pickup || false
	};
	gamePacket = {};
	var sendData = {};
	var attrs = Object.getOwnPropertyNames(newPacket);
	attrs.forEach(atr => {
		var data = newPacket[atr];
		if (JSON.stringify(data) != JSON.stringify(oldData[atr])) {
			sendData[atr] = data;
			oldData[atr] = data;
		}
	});
	if (Object.getOwnPropertyNames(sendData).length > 0) {
		socket.emit('game_data', sendData);
	}
}

function btn(x, y, w, h, txt, col) {
	var needW = textWidth(txt);
	var acW = max(w, needW + buttonSpacer);
	fill(col || 0);
	rect(x, y, acW, h);
	fill(255);
	text(txt, x + 5, y + h / 2 + 4);
	if (mouseX > x && mouseX < x + acW && mouseY > y && mouseY < y + h) {
		if (mouseIsPressed) {
			fill(0, 255, 0, 100);
			rect(x, y, acW, h);
			return true;
		} else {
			fill(0, 100);
			rect(x, y, acW, h);
			return false;
		}
	}
}

function matchTextSize(txt, size, buffer) {
	while (textWidth(txt) > size - buffer) {
		textSize(textSize() - 1);
	}
	while (textWidth(txt) < size - (buffer + 1)) {
		textSize(textSize() + 1);
	}
	textSize(constrain(textSize(), 2, settings.tileSize - 3))
}

function drawItems() {
	textSize(settings.tileSize - 10);
	noStroke();
	items.forEach(it => {
		if (matchedCache[it.symbol]) {
			textSize(matchedCache[it.symbol]);
		} else {
			matchTextSize(it.symbol, settings.tileSize, 3);
			console.log('Matching text size of: %s', it.symbol);
			matchedCache[it.symbol] = textSize();
		}
		var x = it.x * settings.tileSize + (settings.tileSize / 2) - (textWidth(it.symbol) / 2);
		var y = it.y * settings.tileSize + (settings.tileSize / 2) + (settings.tileSize - 10) / 3;
		fill(it.c);
		text(it.symbol, x, y);
	});
}

function drawChat() {
	var x = 15;
	var y = windowHeight - 100;
	var ySpace = 15;
	noStroke();
	fill(255);
	textSize(12);
	for (var i = chat.length - 1; i >= 0; i--) {
		text(chat[i].txt, x, y);
		chat[i].t++;
		y -= ySpace;
	}
	chat = chat.filter(c => c.t < chatFadeTime);
}

function drawBullets() {
	noStroke();
	fill(0);
	for (var i = bullets.length - 1; i >= 0; i--) {
		var b = bullets[i];
		ellipse(b.x, b.y, 3, 3);
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		var outOfBounds = b.x < 0 || b.y < 0 || b.x > map.pixWidth() || b.y > map.pixHeight;
		if (map.blockAt(b.x, b.y) == 'w' || outOfBounds) {
			bullets.splice(i, 1);
		}
	}
}
var InputFeild = function(x, y, w, h, opts) {
	//lable,initText,trigger
	this.x = x;
	this.y = y;
	this.w = w;
	this.addWidth = 0;
	this.h = h;
	this.trigger = opts.trigger || function() {};
	this.active = false;
	this.killed = false;
	var txt = (opts.initText || opts.initText == 0) ? opts.initText.toString() : '';
	this.input = txt;
	this.lable = opts.lable || '';
	this.maxLen = opts.maxLen || Infinity;
	this.sanitize = opts.sanitize || false;
	this.tabTo = opts.tabTo || undefined;
	this.allowCaps = true;
	this.draw = function() {
		textSize(12);
		if (typeof this.input == 'boolean') {
			if (this.input) {
				this.input = 1;
			} else {
				this.input = 0;
			}
		}
		if (this.active) {
			stroke(100, 0, 0);
			strokeWeight(3);
		} else {
			stroke(0);
			strokeWeight(1);
		}
		this.addWidth = max(0, textWidth(this.input) + 5 - this.w);
		fill(51);
		rect(this.x, this.y, this.w + this.addWidth, this.h, 4);
		noStroke(0);
		fill(255);
		text(this.input, x + 2, y + (this.h / 2) - 5, this.w + this.addWidth, this.h);
		text(this.lable, x - textWidth(this.lable), y + (this.h / 2) + 5);
		while (this.input.length > this.maxLen) {
			this.input = this.input.slice(0, -1);
		}
	}
	this.checkActive = function() {
		if (mouseIsPressed) {
			if (this.checkHit(mouseX, mouseY)) {
				this.active = true;
			} else {
				this.active = false;
			}
		}
	}
	this.checkHit = function(x, y) {
		return x > this.x && x < this.x + this.w + this.addWidth && y > this.y && y < this.y + this.h;
	}
	this.keyHandle = function() {
		if (!this.active || this.killed) {
			return;
		}
		if (keyCode == 9 && this.tabTo) {
			this.active = false;
			// textBoxes[this.tabTo].active = true;
			makeActive = this.tabTo;
			setTimeout(setTextActive, 0);
			return;
		}
		if (keyCode == 16 || keyCode == 20 || keyCode == 17 || keyCode == 18) {
			return;
		}
		if (keyCode == 10 || keyCode == 13) {
			this.trigger();
			return;
		}
		if (keyCode == 190) {
			this.input += '.';
			return;
		}
		if (keyCode === 8) {
			this.input = this.input.slice(0, -1);
		} else {
			var toAdd = String.fromCharCode(keyCode);
			if (this.allowCaps && keys[16]) {
				toAdd = toAdd.toUpperCase();
			} else {
				toAdd = toAdd.toLowerCase();
			}
			if (this.sanitize) {
				toAdd = this.clean(toAdd);
			}
			this.input += toAdd;
		}
	}
	this.clean = function(txt) {
		// 48 - 57
		// 65 - 90
		var code = txt.toUpperCase().charCodeAt(0);
		var accept = false;
		if (code >= 48 && code <= 57) {
			accept = true;
		}
		if (code >= 65 && code <= 90) {
			accept = true;
		}
		if (code == 32) {
			accept = true;
		}
		return accept ? txt : '';
	}
	this.run = function() {
		if (this.killed) {
			return;
		}
		this.draw();
		this.checkActive();
	}
}

function BloodHandler(maxBlood) {
	this.blood = [];
	this.maxBlood = maxBlood;
	this.speedMult = 10;
	this.tRange = {
		max: 25,
		min: 6
	};
	this.rateRange = {
		max: 0.5,
		min: 0.2
	};
	this.partRange = {
		min: 5,
		max: 25
	};
	this.newBlood = function(x, y, mult) {
		for (var i = 0; i < floor(random(this.partRange.min, this.partRange.max)) * (mult / 9); i++) {
			if (this.blood.length < this.maxBlood) {
				this.blood.push({
					x: x,
					y: y,
					vx: (random() - 0.5) * this.speedMult,
					vy: (random() - 0.5) * this.speedMult,
					leftT: random(this.tRange.min, this.tRange.max),
					rate: random(this.rateRange.min, this.rateRange.max)
				});
			}
		}
	}
	this.run = function() {
		this.blood.forEach(part => {
			fill(255, 0, 0);
			rect(part.x, part.y, 4, 4);
			if (map.blockAt(part.x + part.vx, part.y) == 'w') {
				part.vx = 0;
			}
			if (map.blockAt(part.x, part.y + part.vy) == 'w') {
				part.vy = 0;
			}
			part.x += part.vx;
			part.y += part.vy;
			part.leftT -= part.rate;
		});
		this.blood = this.blood.filter(part => part.leftT > 0);
	}
}

function init() {
	map = new MapHandler();
	bloodHandler = new BloodHandler(100);
	player = new Player(new p5.Vector(50, 50));
	map.setTs(settings.tileSize);
	cam.setOffset((windowWidth / 2) / player.scl, (windowHeight / 2) / player.scl);
	initNet();
	canv.id('game');
	window.addEventListener('keydown', function(e) {
		if (e.which == 9) {
			e.preventDefault();
		}
	});
}

function setup() {
	canv = createCanvas(windowWidth, windowHeight);
	frameRate(fRate);
	angleMode(DEGREES);
	init();
	if (state == 'login') {
		textBoxes['loginBox'] = new InputFeild(windowWidth / 2 - 40, windowHeight / 2, 80, 25, {
			maxLen: 20,
			lable: 'Name: ',
			sanitize: true,
			tabTo: 'passcode'
		});
		textBoxes['passcode'] = new InputFeild(windowWidth / 2 - 40, windowHeight / 2 + 50, 80, 25, {
			trigger: function() {
				socket.emit('login', {
					user: textBoxes['loginBox'].input,
					pass: sha256(this.input),
				});
				name = textBoxes['loginBox'].input;
			},
			lable: 'Password: ',
			sanitize: true
		});
		textBoxes['loginBox'].active = true;
	}
}

function run() {
	if (mouseIsPressed) {
		player.fire();
	}
	if (frameCount % 20 == 0) {
		lastFrameRate = frameRate().toFixed(0)
	}
	if (frameCount % pingRate == 0 && pingRet && frameCount > 50) {
		socket.emit('ping_', Date.now());
		pingRet = false;
	}
	push();
	scale(player.scl);
	cam.run(-player.pos.x, -player.pos.y);
	map.draw();
	drawItems();
	player.run();
	drawPlayer(players);
	drawBullets();
	bloodHandler.run();
	runGamemode();
	pop();
	player.runUI();
	players.forEach(player => {
		player.pos.x += player.vel.x * dt;
		player.pos.y += player.vel.y * dt;
	});
	if (frameCount % 60 == 0 && player.gun) {
		if (sha256(JSON.stringify(player.gun)) != gHash) {
			socket.emit('self_report', 'Invalid gun hash');
		}
	}
	textSize(12);
	text(curPing + 'ms', 10, 10)
	cam.setOffset((windowWidth / 2) / player.scl, (windowHeight / 2) / player.scl);
}

function runSpectator() {
	push();
	scale(player.scl);
	cam.run(-player.pos.x, -player.pos.y);
	map.draw();
	drawItems();
	player.runSpectator();
	drawPlayer(players);
	drawBullets();
	bloodHandler.run();
	runGamemode();
	pop();
	textSize(12);
	if (isAdmin && btn(windowWidth - 100, 10, 75, 15, 'End game') && mouseUp) {
		socket.emit('admin_command', {
			command: 'end_game'
		});
		mouseUp = false;
	}
	players.forEach(player => {
		player.pos.x += player.vel.x * dt;
		player.pos.y += player.vel.y * dt;
	});
	cam.setOffset((windowWidth / 2) / player.scl, (windowHeight / 2) / player.scl);
}

function runLogin() {
	var x = windowWidth / 2;
	var y = windowHeight / 2 + 100;
	var str = '';
	switch (loginText) {
		case 0:
			str = 'Unknown username';
			break;
		case 1:
			str = 'Incorrect password';
			break;
		case 2:
			str = 'Successfully created user';
			break;
		default:
			str = '';
	}
	noStroke();
	fill(0);
	text(str, x - textWidth(str) / 2, y);
	if (loginText == 0) {
		if (btn(x - 30, y + 50, 60, 25, 'Create user') && mouseUp) {
			socket.emit('login', {
				user: textBoxes['loginBox'].input,
				pass: sha256(textBoxes['passcode'].input),
				newUser: true
			});
			mouseUp = false;
		}
	}
}

function errScreen() {
	background(0);
	textSize(24);
	var str = 'Unknown game state: ' + state;
	text(str, windowWidth / 2 - textWidth(str / 2), windowHeight / 2);
}

function disconScreen() {
	textSize(40);
	fill(0);
	text('Server connection connection lost', 50, 50);
	if (hasPrevConnected) {
		textSize(22);
		var str = 'Server may have closed or you were kicked, ';
		text(str, 50, 80);
		fill(255, 0, 0);
		text('try reloading.', 50 + textWidth(str), 80);
		if (socket) {
			socket.destroy();
		}
		socket = undefined;
	}
	textSize(8);
	text('UwU', windowWidth - textWidth('UwU') - 10, windowHeight - 10);
}

function onZoomChange(zoom) {
	if (state != 'zoomErr' && Math.abs(zoom - 1) > .1) {
		zoomStateSaver = state;
		state = 'zoomErr';
	}
	if (state == 'zoomErr' && Math.abs(zoom - 1) < .1) {
		state = zoomStateSaver;
	}
	lastZoom = zoom;
}

function draw() {
	background(backgroundColor);
	var d = Date.now()
	dt = Math.abs(d - lastFrameTime) / msPerFrame;
	lastFrameTime = d;
	runNetwork();
	if (state != 'discon' && !socket.connected && hasPrevConnected) {
		state = 'discon';
		console.log('Closing socket');
	}
	var zoom = Math.round(((window.outerWidth) / window.innerWidth) * 100) / 100;
	if (zoom != lastZoom) {
		onZoomChange(zoom);
	}
	switch (state) {
		case 'game':
			run();
			break;
		case 'spectator':
			runSpectator();
			break;
		case 'login':
			runLogin();
			break;
		case 'lobby':
			runLobby();
			break;
		case 'discon':
			disconScreen();
			break;
		default:
			errScreen();
	}
	drawChat();
	for (var i in textBoxes) {
		textBoxes[i].run();
		if (textBoxes[i].killed) {
			delete textBoxes[i];
		}
	}
}

function windowResized() {
	createCanvas(windowWidth, windowHeight);
}

function keyPressed() {
	for (var i in textBoxes) {
		textBoxes[i].keyHandle();
	}
	keys[keyCode] = true;
	if (k('t') && textBoxes['chat']) {
		textBoxes['chat'].active = true;
	}
	if (keys[27]) {
		for (var i in textBoxes) {
			textBoxes[i].active = false;
		}
	}
}

function keyReleased() {
	keys[keyCode] = false;
}

function mouseReleased() {
	player.mouseUp = true;
	mouseUp = true;
}

function mousePressed() {}

function mouseDragged() {}