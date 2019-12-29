var playerSpace = 20;
var isAdmin = false;
var adminInitDone = false;
var settingsDispStart;
// var settings = {};

function runLobby() {
	var me = allPlayers.filter(p => p.id == socket.id)[0];
	if (!me) {
		console.log('I do not have a player instance');
		return;
	}
	if (me.isAdmin) {
		isAdmin = true;
	}

	map.draw();
	handleSkin();
	runUI();
	handleAdmin();
}

function adminInit(y) {
	var x = windowWidth - 100;
	var lastBox = '';
	for (var i in settings) {
		settings[i] = settings[i];
		if (settingTypes[i] == 'number') {
			textBoxes[i] = new InputFeild(x, y, 50, 25, {
				lable: i + ': ',
				initText: settings[i],
			});
			if (lastBox) {
				textBoxes[lastBox].tabTo = i;
			}
			lastBox = i;
			y += 35;
		}
	}
	settingsDispStart = y;
	adminInitDone = true;
}

function handleSkin() {
	if (!player.skin.length) {
		if (btn(windowWidth - 100, 25, 75, 20, 'Load a skin')) {
			var data = window.prompt('Skin Data: ', undefined);
			if (data != null && data != '') {
				player.skin = JSON.parse(data);
				console.log('Player skin loaded');
				socket.emit('skin_event', {
					save: false,
					skin: player.skin
				});
				mouseIsPressed = false;
			}
		}
		if (btn(windowWidth - 100, 50, 75, 20, 'Load prev skin') && mouseUp) {
			socket.emit('skin_event', {
				requestFromSave: true
			});
			mouseUp = false;
		}
	} else {
		if (btn(windowWidth - 150, 25, 125, 20, 'Save skin to server') && mouseUp) {
			socket.emit('skin_event', {
				save: true,
				skin: player.skin
			});
			mouseUp = false;
		}
		if (btn(windowWidth - 150, 50, 125, 20, 'Clear Skin')) {
			player.skin = [];
			socket.emit('skin_event', {
				save: false,
				skin: []
			});
		}
	}
}

function joinTeam(team, who) {
	if (who == this.socket.id) {
		socket.emit('join_team', team);
		player.team = team.id;
	} else {
		socket.emit('admin_command', {
			command: 'set_team',
			teamId: team.id,
			playerId: who
		});
	}
}

function runUI() {
	fill(0, 100);
	stroke(25);
	rect(20, 20, 250, windowHeight - 40);
	if (btn(windowWidth - 100, 3, 70, 14, 'Anti-Lag')) {
		runBlocks = false;
	}
	var x = 35;
	var y = 35;
	textSize(14);
	allPlayers.forEach(player => {
		fill(200);
		noStroke();
		if (player.team) {
			var t = teams.find(t => t.id == player.team);
			if (!t) {
				console.log('User has unknown team id');
			} else {
				fill(t.color);
			}
		}
		text(player.name, x, y);
		if (player.isAdmin) {
			fill(0, 255, 0);
			ellipse(x - 10, y - 4, 5, 5);
		}
		if (isAdmin) {
			if (btn(x + textWidth(player.name) + 10, y - 12, 35, 15, 'Kick') && mouseUp) {
				socket.emit('admin_command', {
					command: 'kick',
					id: player.id
				});
				mouseUp = false;
			}
		}
		if ((player.id == socket.id || isAdmin) && settings.teamMode) {
			var tx = x + textWidth(player.name) + 10 + (isAdmin ? 50 : 0);
			teams.forEach((team, idx) => {
				if (btn(tx, y - 12, 35, 15, 'Team ' + idx) && mouseUp) {
					joinTeam(team, player.id);
					mouseUp = false;
				}
				tx += textWidth('Team 1') + 15;
			});
		}
		y += playerSpace;
	});
}

function apply() {
	for (var i in textBoxes) {
		if (settings.hasOwnProperty(i)) {
			settings[i] = parseFloat(textBoxes[i].input);
		}
	}
	socket.emit('admin_command', {
		command: 'new_settings',
		settings: settings
	});
}

function startGame() {
	// apply();
	socket.emit('admin_command', {
		command: 'start_game',
		settings: settings
	});
}

function colSet(bool) {
	return !bool ? color(0) : color(0, 200, 0);
}

function drawSettings(yStart) {
	var x = windowWidth - 100;
	var y = settingsDispStart;
	for (var i in settings) {
		if (settingTypes[i] == 'bool') {
			noStroke();
			fill(255);
			text(i + ': ', x - textWidth(i + ': ') - 5, y + (25 / 2) + 5);
			if (btn(x - 5, y, 25, 25, 'True', colSet(settings[i] == true))) {
				settings[i] = true;
				mouseUp = false;
				apply();
			}
			if (btn(x + 40, y, 25, 25, 'False', colSet(settings[i] == false))) {
				settings[i] = false;
				mouseUp = false;
				apply();
			}
			y += 35;
		} else if (Array.isArray(settingTypes[i])) {
			for (var i2 = 0; i2 < settingTypes[i].length; i2++) {
				if (i2 == 0) {
					x = windowWidth - textWidth(settingTypes[i][i2]) - 25;
				}
				if (btn(x, y, 0, 25, settingTypes[i][i2], colSet(settings[i] == settingTypes[i][i2])) && mouseUp) {
					settings[i] = settingTypes[i][i2];
					apply();
					mouseUp = false;
				}
				x -= textWidth(settingTypes[i][i2 + 1] || '') + 15;
			}
			fill(255);
			text(i + ': ', x - textWidth(i + ': ') + 10, y + (25 / 2) + 5);
			y += 35;
			x = windowWidth - 100;
		}
	}
}

function handleAdmin() {
	if (isAdmin) {
		if (btn(windowWidth / 2 - 50, 50, 100, 60, 'Start Game') && mouseUp) {
			startGame();
			mouseUp = false;
		}
		var y = 100;
		var x = windowWidth - 100;
		allMaps.forEach(map => {
			if (btn(x, y, 75, 15, map.data.name) && mouseUp) {
				socket.emit('admin_command', {
					command: 'set_map',
					id: map.data.id
				});
				mouseUp = false;
			}
			y += 20;
		});
		if (!adminInitDone) {
			adminInit(y);
		}
		drawSettings();
	}
}