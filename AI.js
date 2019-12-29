const PF = require('pathfinding');
const fs = require('fs');
const GUN = 0;
const ARMOR = 1;
const ANY = 2;
const CORNERS = 'corners';
const CENTER = 'center'

var aiNum = 0;

function newID() {
	return Math.floor(Math.random() * 1e10);
}

//Convert a map value to a pixal value
function toPix(n) {
	return n * settings.tileSize;
}

//Convert a pixal value to a map value
function toMap(n) {
	return Math.floor(n / settings.tileSize);
}

//Get a block on the map
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

var getUserById = id => players.find(obj => obj.id == id);

//Checks if an item is a type of armor
function isArmor(item) {
	return item.symbol[0] == 'A' && item.symbol.length > 1
}

var AIPlayer = function(PlayerConstructor) {
	var id = newID();
	//A fake network handler
	this.netHandler = {
		id: id,
		emit: (event, data) => {
			if (event == 'game_event') {
				switch (data.type) {
					case 'spawn':
						this.player.pos.x = data.x;
						this.player.pos.y = data.y;
						break;
					case 'hits':
						data.hits.filter(hit => hit.playerId == this.id).forEach(hit => {
							this.player.hp -= hit.dmg * this.player.bodyArmor;
							this.lastShotBy = hit.shotBy;
						});
						break;
					case 'set_state':
						if (data.state == 'spectator') {
							this.permDeath = true;
						}
						break;
					case 'set_gun':
						this.player.gun = data.gun.name;
						var pMod = Guns[this.player.gun].playerMod;
						this.loadMod(pMod);
						break;
				}
			}
		},
		disconnect: () => {
			log(0, 'AI Connection disconnect called');
			this.destroyed = true;
		}
	};
	this.player = new PlayerConstructor(this.netHandler);
	this.player.name = 'TheLegend' + (aiNum++);
	this.player.isAi = true;
	this.id = id;
	this.destroyed = false;
	this.permDeath = false;
	this.path = [];
	this.target = {};
	this.speed = 3;
	this.viewDist = 600;
	this.scl = 1;
	this.drawLaser = false;
	this.map;
	this.respawnT = 0;
	this.regen = 0;
	this.regenTime = 0;
	this.hpMin = 0;
	this.hpMax = 100;
	this.finder = new PF.AStarFinder();
	this.state = 'waiting';
	this.shootTimer = 0;
	this.reloadTimer = 0;
	this.lastShotBy = '';
	this.ammo = Guns[this.player.gun].magSize;
	this.loadMap = function(grid) {
		this.map = new PF.Grid(grid);
	}
	this.fire = function() {
		var gun = Guns[this.player.gun]
		if (this.reloadTimer > 0 || this.player.dead) {
			return;
		}
		if (this.ammo == 0) {
			this.reloadTimer = gun.reloadTime;
			return;
		}
		if (this.shootTimer < gun.fireRate) {
			return;
		}
		this.ammo--;
		this.shootTimer = gun.type == 'semi' ? Math.random() * (-5 - -15) + -15 : 0;
		bh.addBullet(this.player);
	}
	this.move = function() {
		if (this.path.length == 0) {
			return;
		}
		var targetX = toPix(this.path[0][0]) + settings.tileSize / 2;
		var targetY = toPix(this.path[0][1]) + settings.tileSize / 2;
		if (this.player.pos.x > targetX) {
			this.player.pos.x -= this.speed;
		}
		if (this.player.pos.x < targetX) {
			this.player.pos.x += this.speed;
		}
		if (this.player.pos.y > targetY) {
			this.player.pos.y -= this.speed;
		}
		if (this.player.pos.y < targetY) {
			this.player.pos.y += this.speed;
		}
		if (Math.dist(this.player.pos.x, this.player.pos.y, targetX, targetY) < settings.tileSize / 2) {
			this.path.shift();
		}
	}
	this.pathLogic = {
		ai: this,
		getGun: function() {
			var closeGun = this.ai.getItems(GUN).random();
			if (closeGun) {
				this.ai.target = {
					x: closeGun.x,
					y: closeGun.y
				};
				// log(0, 'AI Pathfinding to gun');
				var x = toMap(this.ai.player.pos.x);
				var y = toMap(this.ai.player.pos.y);
				this.ai.path = this.ai.finder.findPath(x, y, this.ai.target.x, this.ai.target.y, this.ai.map.clone());
				this.ai.state = 'getting_gun';
			}
		},
		getArmor: function() {
			var closeItem = this.ai.getItems(ARMOR).random();
			if (closeItem) {
				this.ai.target = {
					x: closeItem.x,
					y: closeItem.y
				};
				// log(0, 'AI Pathfinding to armor');
				var x = toMap(this.ai.player.pos.x);
				var y = toMap(this.ai.player.pos.y);
				this.ai.path = this.ai.finder.findPath(x, y, this.ai.target.x, this.ai.target.y, this.ai.map.clone());
				this.ai.state = 'getting_item';
			}
		},
		huntPlayer: function() {
			var player = this.ai.getClosestPlayer();
			if (player) {
				this.ai.target = {
					x: toMap(player.pos.x),
					y: toMap(player.pos.y)
				};
				// log(0, 'AI Gunna fuck up a human');
				var x = toMap(this.ai.player.pos.x);
				var y = toMap(this.ai.player.pos.y);
				this.ai.path = this.ai.finder.findPath(x, y, this.ai.target.x, this.ai.target.y, this.ai.map.clone());
				this.ai.state = 'hunt';
			}
		}
	}
	this.choosePath = function() {
		if (this.state == 'waiting') {
			var rand = Math.random();
			if (this.player.gun == 'pistol' || rand > .5) {
				this.pathLogic.getGun();
			} else if (rand < .5) {
				this.pathLogic.getArmor();
			}
			if (rand < .1 && this.player.gun != 'pistol' && this.player.bodyArmor != 1) {
				log(0, 'AI Switching to hunt mode');
				this.state = 'hunt';
			}
		} else if (this.state == 'hunt') {
			if (tick % 25 == 0) {
				this.pathLogic.huntPlayer();
			}
		}
	}
	this.shoot = function() {
		var formPlayers = players.filter(p => p.id != this.id && !p.dead)
		if (settings.teamMode) {
			formPlayers = formPlayers.filter(p => p.team != this.player.team);
		}
		formPlayers = formPlayers.map(p => {
			return {
				pos: p.pos,
				d: Math.dist(this.player.pos.x, this.player.pos.y, p.pos.x, p.pos.y)
			}
		});
		formPlayers = formPlayers.filter(p => p.d < this.viewDist).sort((a, b) => a.d - b.d);
		formPlayers = formPlayers.filter(p => {
			var hits = false;
			flatMap.forEach(tile => {
				if (!hits && tile.type == 'w' &&
					lineRectCollide(this.player.pos.x, this.player.pos.y, p.pos.x, p.pos.y,
						toPix(tile.x), toPix(tile.y), settings.tileSize, settings.tileSize
					)
				) {
					hits = true;
				}
			});
			return !hits
		});
		var playerTarget = formPlayers[0];
		if (!playerTarget) {
			return;
		}
		var dx = playerTarget.pos.x - this.player.pos.x;
		var dy = playerTarget.pos.y - this.player.pos.y;
		var ang = Math.atan2(dy, dx);
		this.player.rot = ang * 180 / Math.PI;
		this.fire();
	}
	this.attemptPickup = function() {
		if (!this.player.canPickUp) {
			this.state = 'hunt';
			return;
		}
		var block = blockAt(this.player.pos.x, this.player.pos.y);
		if (block.gun) {
			if (this.state == 'getting_gun') {
				this.state = 'waiting';
			}
			if (Guns[block.gun.item].rarity < Guns[this.player.gun].rarity) {
				return;
			}
			this.player.gun = block.gun.item;
			var pMod = Guns[this.player.gun].playerMod;
			this.loadMod(pMod);

			items = items.filter(item => item.id != block.gun.id);
			block.gun = undefined;
		}
		if (block.item && isArmor(Items[block.item.item])) {
			if (this.state == 'getting_item') {
				this.state = 'waiting';
			}
			var itemVal = Items[block.item.item].playerMod.bodyArmor;
			if (itemVal > this.player.bodyArmor) {
				return;
			}
			if (itemVal) {
				this.player.bodyArmor = itemVal;
			}
			items = items.filter(item => item.id != block.item.id);
			block.item = undefined;
		}
	}
	this.loadMod = function(pMod) {
		for (var attr in pMod) {
			if (this.hasOwnProperty(attr)) {
				this[attr] = pMod[attr];
			} else {
				if (attr == 'bodyArmor') {
					this.player.bodyArmor = pMod[attr];
				} else {
					log(2, 'AI object does not have property: ' + attr);
				}
			}
		}
	}
	this.run = function() {
		if (this.permDeath) {
			this.player.dead = true;
			this.destroyed = true;
			return;
		}
		this.viewDist = 600 / this.scl;
		this.choosePath();
		this.move();
		this.shoot();
		var bAt = blockAt(this.player.pos.x, this.player.pos.y);
		if (bAt.canHaveGun || bAt.canHaveItem) {
			this.attemptPickup();
		}
		if (this.player.hp <= 0 && !this.player.dead) {
			this.player.dead = true;
			this.respawnT = Math.floor(Math.random() * 50 + 50);
			this.path = [];
			this.target = {};
			this.state = 'dead';
			var p = getUserById(this.lastShotBy);
			if (!p) {
				log(2, 'Invalid killer');
				return;
			}
			p.kills++;
		}
		this.respawnT--;
		this.shootTimer++;
		this.reloadTimer--;
		this.regenTime--;
		if (this.respawnT == 0) {
			this.player.spawn();
			this.state = 'waiting';
		}
		if (this.reloadTimer == 0) {
			this.ammo = Guns[this.player.gun].magSize;
		}
		if (this.regenTime > 0) {
			this.player.hp += this.regen;
			console.log(this.player.hp, this.regen, this.regenTime);
		}
		this.player.hp = Math.min(this.player.hp, this.hpMax);
		this.player.hp = Math.max(this.player.hp, this.hpMin);
	}
	this.getItems = function(itemSel) {
		switch (itemSel) {
			case GUN:
				return items.filter(item => item.type == 'gun');
			case ARMOR:
				return items.filter(item => item.type == 'item' && item.symbol[0] == 'A' && item.symbol.length > 1);
			case ANY:
				return items
			default:
				return items.filter(item => item.item.name == itemSel);
		}
	}
	this.getClosestPlayer = function() {
		var usePlayers = players.filter(p => p.id != this.id && !p.dead);
		if (settings.teamMode) {
			usePlayers = players.filter(p => p.team != this.player.team);
		}
		var bestPlayer;
		var bestD = Infinity;
		usePlayers.forEach(player => {
			var d = Math.dist(this.player.pos.x, this.player.pos.y, player.pos.x, player.pos.y);
			if (d < bestD) {
				bestD = d;
				bestPlayer = player;
			}
		});
		return bestPlayer;
	}
};
var AIHandler = function() {
	this.gamemode = 'ffa';
	this.ais = [];
	this.grid = [];
	this.setGamemode = function(newGm) {
		this.gamemode = newGm;
	}
	this.init = function(numAi, playerConstructor) {
		this.ais = [];
		players = players.filter(p => !p.isAi);
		for (var i = 0; i < numAi; i++) {
			this.ais.push(new AIPlayer(playerConstructor))
		}
		players = players.concat(this.ais.map(ai => ai.player));
		this.ais.forEach(ai => ai.loadMap(this.grid));
		log(0, 'AI Handler init complete');
	}
	this.initMap = function(map) {
		this.grid = [];
		map.forEach((row, idx) => {
			this.grid.push([]);
			row.forEach(tile => {
				this.grid[idx].push(tile.type == 'w' || tile.type == 'h' ? 1 : 0);
			});
		});
		this.ais.forEach(ai => ai.loadMap(this.grid));
		log(0, 'AI map init complete');
	}
	this.run = function() {
		this.ais.forEach(ai => ai.run());
		this.ais = this.ais.filter(ai => !ai.destroyed);
	}
};

{
	var coords2Points = function(x1, y1) {
		var i, j, points = [];
		for (i = j = 0; i < arguments.length; j++) {
			points[j] = {
				x: arguments[i++],
				y: arguments[i++]
			};
		}
		return points;
	};
	var rotatePoint = function(x, y, theta, sine) {
		var cosine = theta;
		if (sine === undefined) {
			cosine = cos(theta);
			sine = sin(theta);
		}
		return {
			x: cosine * x + sine * y,
			y: -sine * x + cosine * y
		};
	};
	var rectangleMode = function(mode) {
		if (mode !== undefined) {
			rectangleMode.mode = mode;
		}
		return rectangleMode.mode;
	};
	var rect2Points = function(x, y, w, h, theta) {
		var p;
		if (rectangleMode.mode === CORNERS) {
			w -= x;
			h -= y;
		}
		if (theta) {
			var cosine = cos(-theta);
			var sine = sin(-theta);
			if (rectangleMode.mode === CENTER) {
				w /= 2;
				h /= 2;
				p = [
					rotatePoint(-w, -h, cosine, sine),
					rotatePoint(+w, -h, cosine, sine),
					rotatePoint(+w, +h, cosine, sine),
					rotatePoint(-w, +h, cosine, sine)
				];
			} else {
				p = [{
						x: 0,
						y: 0
					},
					rotatePoint(w, 0, cosine, sine),
					rotatePoint(w, h, cosine, sine),
					rotatePoint(0, h, cosine, sine)
				];
			}
			for (var i = 0; i < p.length; i++) {
				p[i].x += x;
				p[i].y += y;
			}
		} else if (rectangleMode.mode === CENTER) {
			w /= 2;
			h /= 2;
			p = coords2Points(x - w, y - h, x + w, y - h, x + w, y + h, x - w, y + h);
		} else {
			p = coords2Points(x, y, x + w, y, x + w, y + h, x, y + h);
		}
		return p;
	};
	var isInPolygon = function(x, y, poly) {
		var isIn = false;
		for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			var xi = poly[i].x,
				yi = poly[i].y;
			var xj = poly[j].x,
				yj = poly[j].y;
			var intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
			if (intersect) {
				isIn = !isIn;
			}
		}
		return isIn;
	};
	var overlap = function(a, b, c, d) {
		return isBetween(c < d ? c : d, a, b) || isBetween(a < b ? a : b, c, d);
	};
	var isBetween = function(c, a, b) {
		return (a - c) * (b - c) <= 0;
	};
	var lineLineCollide = function(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
		var denom = (ax1 - ax2) * (by1 - by2) - (ay1 - ay2) * (bx1 - bx2);
		if (denom === 0) {
			if (ax1 === ax2) {
				return ax1 === bx1 && overlap(ay1, ay2, by1, by2);
			} else {
				var m = (ay1 - ay2) / (ax1 - ax2);
				var ka = ay1 - m * ax1;
				var kb = by1 - m * bx1;
				return ka === kb && overlap(ax1, ax2, bx1, bx2);
			}
		}
		var base = 1 / 1024 / 1024 / 1024;
		var ROUND = function(n) {
			return Math.round(n / base) * base;
		};
		var na = ax1 * ay2 - ay1 * ax2;
		var nb = bx1 * by2 - by1 * bx2;
		var x = ROUND((na * (bx1 - bx2) - (ax1 - ax2) * nb) / denom);
		var y = ROUND((na * (by1 - by2) - (ay1 - ay2) * nb) / denom);
		return isBetween(x, ROUND(ax1), ROUND(ax2)) && isBetween(x, ROUND(bx1), ROUND(bx2)) && isBetween(y, ROUND(ay1), ROUND(ay2)) && isBetween(y, ROUND(by1), ROUND(by2));
	};
	var linePolygonCollide = function(x1, y1, x2, y2, poly) {
		var collide = isInPolygon(x1, y1, poly);
		for (var j = poly.length - 1, i = 0; !collide && i < poly.length; j = i, i++) {
			collide = lineLineCollide(x1, y1, x2, y2, poly[j].x, poly[j].y, poly[i].x, poly[i].y);
		}
		return collide;
	};
	var lineRectCollide = function(x1, y1, x2, y2, x, y, w, h, theta) {
		var rect = rect2Points(x, y, w, h, theta);
		return linePolygonCollide(x1, y1, x2, y2, rect);
	};
}
/*
var mapTile = {
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
var gun = {
	x: point.x,
	y: point.y,
	item: gun,
	id: newID(false),
	c: rarityColors[Guns[gun].rarity],
	symbol: Guns[gun].symbol,
	type: 'gun'
};
var item = {
	x: point.x,
	y: point.y,
	item: item,
	id: newID(false),
	c: [0, 0, 0, 255],
	symbol: Items[item].symbol,
	type: 'item'
};
*/

module.exports = new AIHandler();