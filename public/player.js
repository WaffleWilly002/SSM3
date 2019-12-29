var numCols = 32;
const specSpeed = 5;
var Player = function(pos) {
	this.pos = createVector(pos.x, pos.y);
	this.vel = createVector(0, 0);
	this.rot = 0;
	this.speed = 3;
	this.hp = 100;
	this.hpMin = 0;
	this.hpMax = 100;
	this.ammo = 0;
	this.dead = false;
	this.drawLaser = false;
	this.gun;
	this.scl = 1;
	this.id;
	this.bodyArmor = 1;
	this.regen = 0;
	this.regenTime = 0;
	this.dispHp = 100;
	this.lastShotBy = 'You should not be seeing this';
	this.lastShotById = '';
	this.shootTimer = 0;
	this.mouseUp = true;
	this.canPickUp = true;
	this.skin = [];
	this.overlays = [];
	this.items = [];
	this.team;
	var that = this;
	this.itemUseUI = {
		r: 0,
		time: 20,
		done: true,
		item: undefined,
		player: that,
		trigger: function(time) {
			this.r = 0;
			this.time = time;
			this.done = false;
		},
		draw: function(x, y, size) {
			if (this.done) {
				return;
			}
			strokeWeight(5);
			noFill();
			stroke(0, 50);
			arc(x, y, size, size, 0, 360 - this.r);
			this.r += 360 / this.time;
			if (this.r >= 360) {
				this.done = true;
				this.player.useItem(this.item);
			}
		}
	};
	this.reloadUI = {
		r: 0,
		time: 20,
		done: false,
		player: that,
		trigger: function(time) {
			this.r = 0;
			this.time = time;
			this.done = false;
		},
		draw: function(x, y, size) {
			if (this.done) {
				return;
			}
			strokeWeight(5);
			noFill();
			stroke(0, 50);
			arc(x, y, size, size, 0, 360 - this.r);
			this.r += 360 / this.time;
			if (this.r >= 360) {
				this.done = true;
				this.player.reload();
			}
		}
	}
	this.fire = function() {
		if (!this.gun || !this.reloadUI.done || this.dead) {
			return;
		}
		if (this.ammo == 0) {
			this.startReload();
			return;
		}
		if (this.shootTimer < this.gun.fireRate) {
			return;
		}
		if ((this.gun.type == 'semi' || this.gun.type == 'spread') && !this.mouseUp) {
			return;
		}
		this.ammo--;
		this.mouseUp = false;
		this.shootTimer = 0;
		socket.emit('shoot', {
			x: this.pos.x,
			y: this.pos.y,
			r: this.rot
		});
	}
	this.setGun = function(g) {
		if (!g) {
			return;
		}
		this.gun = g;
		this.ammo = this.gun.magSize;
		this.reloadUI.done = true;
		this.loadPlayerMod(this.gun.playerMod);
	}
	this.loadPlayerMod = function(pMod) {
		for (var attr in pMod) {
			if (this.hasOwnProperty(attr)) {
				this[attr] = pMod[attr];
			} else {
				console.log('Player object does not have property \'%s\'', attr);
			}
		}
	}
	this.takeDmg = function(hit) {
		if (this.dead || this.hp <= 0) {
			return;
		}
		this.hp -= hit.dmg * this.bodyArmor;
		var pObj = allPlayers.filter(player => player.id == hit.shotBy)[0];
		if (!pObj) {
			console.log('Unable to resolve who killed player');
		} else {
			this.lastShotBy = pObj.name;
			this.lastShotById = pObj.id;
		}
		this.overlays.push({
			c: {
				r: 255,
				g: 0,
				b: 0,
				a: 120
			},
			rate: 9 / hit.dmg * 2,
			deadZone: 10,
			dead: false
		});
	}
	this.setBodyArmor = function(a) {
		if (!a) {
			this.bodyArmor = 1;
		} else {
			this.bodyArmor = a;
		}
	}
	this.pointAtMouse = function() {
		this.rot = degrees(Math.atan2(mouseY - windowHeight / 2 - (cam.y + this.pos.y), mouseX - windowWidth / 2 - (cam.x + this.pos.x)));
	}
	this.draw = function() {
		this.pointAtMouse();
		drawPlayer(this);
		this.reloadUI.draw(this.pos.x, this.pos.y, settings.playerSize * 2);
		this.itemUseUI.draw(this.pos.x, this.pos.y, settings.playerSize * 1.75);
		if (this.drawLaser) {
			stroke(255, 0, 0);
			strokeWeight(1);
			var nx = cos(this.rot) * 10000 + this.pos.x;
			var ny = sin(this.rot) * 10000 + this.pos.y;
			line(this.pos.x, this.pos.y, nx, ny);
		}
	}
	this.move = function() {
		var nx = this.pos.x + (this.vel.x * dt);
		var pts = this.getColPoints(nx, this.pos.y);
		if (this.checkHit(pts)) {
			this.vel.x = 0;
		}
		var ny = this.pos.y + (this.vel.y * dt);
		var pts = this.getColPoints(this.pos.x, ny);
		if (this.checkHit(pts)) {
			this.vel.y = 0;
		}
		this.pos.x += this.vel.x * dt;
		this.pos.y += this.vel.y * dt;
		if (this.vel.mag() < 0.5) {
			this.vel.mult(0);
		}
		this.pos.x = constrain(this.pos.x, 0, map.pixWidth());
		this.pos.y = constrain(this.pos.y, 0, map.pixHeight());
	}
	this.checkHit = function(points) {
		for (var i = 0; i < points.length; i++) {
			var bAt = map.blockAt(points[i].x, points[i].y);
			if (bAt == 'w' || bAt == 'h') {
				return true;
			}
		}
		return false;
	}
	this.getColPoints = function(x, y) {
		var points = [];
		stroke(0, 255, 0);
		for (var i = 0; i < 360; i += 360 / numCols) {
			var nx = cos(i) * settings.playerSize / 2 + x;
			var ny = sin(i) * settings.playerSize / 2 + y;
			points.push({
				x: nx,
				y: ny
			});
			if (drawHB) {
				point(nx, ny);
			}
		}
		return points;
	}
	this.run = function() {
		this.checkRespawn();
		if (this.dead) {
			return;
		}
		if (this.hp <= 0) {
			this.vel.x = 0;
			this.vel.y = 0;
			this.dead = true;
			socket.emit('death', this.lastShotById);
		}
		this.hp = constrain(this.hp, this.hpMin, this.hpMax);
		this.draw();
		this.handleKeys();
		this.move();
		if (this.regenTime > 0) {
			this.hp += this.regen;
		}
		this.shootTimer++;
		this.regenTime--;
	}
	this.runSpectator = function() {
		this.dead = true;
		this.hp = 0;
		if (textBoxes['chat'].active) {
			return;
		}
		if (k('w')) {
			this.pos.y -= specSpeed;
		}
		if (k('s')) {
			this.pos.y += specSpeed;
		}
		if (k('a')) {
			this.pos.x -= specSpeed;
		}
		if (k('d')) {
			this.pos.x += specSpeed;
		}
	}
	this.runOverlays = function() {
		this.overlays.forEach(overlay => {
			var c = overlay.c;
			c.a -= overlay.rate;
			if (c.a < overlay.deadZone) {
				overlay.dead = true;
			}
			fill(c.r, c.g, c.b, c.a);
			rect(-10, -10, windowWidth + 20, windowHeight + 20);
		});
		this.overlays = this.overlays.filter(overlay => !overlay.dead);
	}
	this.getItem = function(item) {
		if (item.useTime < 1) {
			this.useItem(item);
			return;
		}
		var itemIdx = -1;
		for (var i = 0; i < this.items.length; i++) {
			if (this.items[i].name == item.name) {
				itemIdx = i;
				break;
			}
		}
		if (itemIdx == -1) {
			this.items.push(item);
		} else if (item.canStack) {
			this.items[itemIdx].quantity += item.quantity;
		}
	}
	this.useItem = function(item) {
		this.loadPlayerMod(item.playerMod);
		item.quantity--;
	}
	this.handleKeys = function() {
		if (textBoxes['chat'].active) {
			return;
		}
		if (k('r')) {
			this.startReload();
		}
		if (k('w')) {
			this.vel.y = -this.speed;
		} else if (k('s')) {
			this.vel.y = this.speed;
		} else {
			this.vel.y *= settings.dc;
		}
		if (k('a')) {
			this.vel.x = -this.speed;
		} else if (k('d')) {
			this.vel.x = this.speed;
		} else {
			this.vel.x *= settings.dc;
		}
		if ((k('w') || k('s')) && (k('a') || k('d'))) {
			this.vel.normalize();
			this.vel.mult(this.speed);
		}
		var block = map.blockAt(this.pos.x, this.pos.y);
		if (k('f')) {
			if ((block == 'g' || block == 'i') && this.canPickUp) {
				gamePacket.pickup = true;
				this.canPickUp = false;
			}
		} else {
			this.canPickUp = true;
		}
		if (keys[16]) {
			this.throwNade();
		}
		if (keyIsPressed && keyCode >= 49 && keyCode <= 57) {
			var item = this.items[keyCode - 49];
			if (item && this.itemUseUI.done) {
				this.itemUseUI.trigger(item.useTime);
				this.itemUseUI.item = item;
				//this.useItem(this.items[keyCode-49]);
			}
		}
	}
	this.throwNade = function() {}
	this.checkRespawn = function() {
		if (k(' ') && this.dead) {
			gamePacket.requestRespawn = true;
		}
	}
	this.respawn = function(x, y) {
		this.pos.x = x;
		this.pos.y = y;
		console.log('Spawned X: %s, Y: %s', x, y);
		this.vel.mult(0);
		this.dead = false;
		this.hp = 100;
		this.bodyArmor = 1;
		this.items = [];
		this.overlays = [];
	}
	this.startReload = function() {
		if (this.gun.canReload && this.reloadUI.done && this.ammo != this.gun.magSize) {
			this.reloadUI.trigger(this.gun.reloadTime);
		}
	}
	this.runUI = function() {
		this.runOverlays();
		this.dispHp = lerp(this.dispHp, this.hp, 0.1);
		strokeWeight(3);
		fill(255, 50);
		stroke(0);
		if (windowWidth > 630) {
			rect(300, windowHeight - 100, windowWidth - 600, 40, 2);
			var l = p5.prototype.map(this.dispHp, this.hpMin, this.hpMax, 0, windowWidth - 600 - 30);
			noStroke();
			fill(255, 150);
			rect(315, windowHeight - 95, l, 30, 2);
		}
		textSize(24);
		fill(0);
		if (this.gun) {
			var str = this.ammo + '/' + this.gun.magSize;
			text(str, windowWidth - 290, windowHeight - 70);
		}
		if (this.dead) {
			textSize(12);
			var str = 'Killed by: ' + this.lastShotBy;
			var boxSize = max(100, textWidth(str));
			stroke(0);
			strokeWeight(3);
			fill(255, 25);
			rect(windowWidth / 2 - boxSize, 120, boxSize * 2, 70);
			noStroke();
			fill(0);
			textSize(24);
			text('You are dead', windowWidth / 2 - textWidth('You are dead') / 2, 150);
			textSize(20);
			text(str, windowWidth / 2 - textWidth(str) / 2, 175);
		}
		var curY = 25;
		textSize(24);
		fill(0);
		noStroke();
		this.items.forEach((item, idx) => {
			var str = (idx + 1) + ': ' + item.name + ' x' + item.quantity;
			text(str, windowWidth - textWidth(str) - 10, curY);
			if (item.quantity <= 0) {
				this.items.splice(idx, 1);
			}
			curY += 25;
		});
		textSize(12);
		if (isAdmin && btn(windowWidth - 100, 10, 75, 15, 'End game') && mouseUp) {
			socket.emit('admin_command', {
				command: 'end_game'
			});
			mouseUp = false;
		}
		if (btn(windowWidth - 100, 30, 75, 15, 'Spectate') && mouseUp) {
			if (confirm('Are you sure you want to enter spectator mode?')) {
				state = 'spectator';
			}
			mouseUp = false;
		}
		var x = 10;
		var y = 35;
		textSize(13);
		allPlayers.sort((a, b) => b.kills - a.kills).forEach(player => {
			text(player.name + ': ' + player.kills, x, y);
			y += 20;
		});
	}
	this.reload = function() {
		if (!this.gun) {
			return;
		}
		this.ammo = this.gun.magSize;
	}
}

function drawPlayerSkin(x, y, skin) {
	for (var i = 0; i < skin.length; i++) {
		stroke(skin[i].color);
		point(skin[i].x + x - settings.playerSize / 2, skin[i].y + y - settings.playerSize / 2);
	}
}

function drawPlayer(player) {
	if (Array.isArray(player)) {
		player.forEach(play => drawPlayer(play));
	}
	if (!player || !player.gun || player.dead) {
		return;
	}
	fill(200);
	var bx = cos(player.rot);
	var by = sin(player.rot);
	var bVec = new p5.Vector(bx, by);
	bVec.normalize();
	bVec.mult(player.gun.barrel.len);
	bVec.add(new p5.Vector(player.pos.x, player.pos.y));
	strokeWeight(5);
	stroke(player.gun.barrel.color.r, player.gun.barrel.color.g, player.gun.barrel.color.b);
	line(player.pos.x, player.pos.y, bVec.x, bVec.y);
	strokeWeight(2.5);
	if (player.bodyArmor != 1) {
		stroke(p5.prototype.map(player.bodyArmor, 0.7, 1, 0, 255));
	} else {
		noStroke();
	}
	if (settings.teamMode && player.team) {
		var t = teams.filter(t => t.id == player.team)[0];
		fill(t.color);
	} else {
		fill(255);
	}
	ellipse(player.pos.x, player.pos.y, settings.playerSize, settings.playerSize);
	strokeWeight(1);
	textSize(12);
	if (player.id != socket.id) {
		text(player.name,
			player.pos.x - textWidth(player.name) / 2,
			player.pos.y - (settings.playerSize - 5));
	}
	var skin = skins.filter(skin => skin.id == player.id)[0];
	if (skin && skin.skin) {
		drawPlayerSkin(player.pos.x, player.pos.y, skin.skin);
	}
}