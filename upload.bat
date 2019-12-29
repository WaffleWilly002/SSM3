@echo off
IF NOT EXIST "C:\Users\%username%\.ssh\id_rsa." (
	echo No rsa_id file located, downloading from server
	scp deploy@167.71.181.0:id_rsa C:\Users\%username%\.ssh\
) ELSE (
	echo Uploading via rsa auth
)
for %%I in (.) do set CurrDirName=%%~nxI
scp index.js "deploy@167.71.181.0:'%CurrDirName%'"
scp antiCheat.js "deploy@167.71.181.0:'%CurrDirName%'"
scp gamemodeLoader.js "deploy@167.71.181.0:'%CurrDirName%'"
scp upload.bat "deploy@167.71.181.0:'%CurrDirName%'"
scp AI.js "deploy@167.71.181.0:'%CurrDirName%'"
scp -r gamemodes "deploy@167.71.181.0:'%CurrDirName%'"
scp -r public "deploy@167.71.181.0:'%CurrDirName%'"
scp -r data "deploy@167.71.181.0:'%CurrDirName%'"