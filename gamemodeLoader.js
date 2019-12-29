module.exports = function() {
	const fs = require('fs');
	var modes = fs.readdirSync('./gamemodes');
	var gamemodes = {};
	modes.forEach(name => {
		var gamemode = require('./gamemodes/' + name);
		gamemode.settingsOverrides.overrideEndGame = typeof gamemode.checkGameEnd == 'function';
		gamemodes[name.substring(0, name.length - 3)] = gamemode;
	});
	return gamemodes;
};