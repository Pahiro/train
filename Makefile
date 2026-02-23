-include deploy.local.mk

SERVER?=root@192.168.1.119
DEPLOY_PATH?=/opt/train

build:
	GOOS=linux GOARCH=amd64 go build -o train .

deploy: build
	ssh $(SERVER) "systemctl stop train"
	scp train $(SERVER):$(DEPLOY_PATH)/train
	ssh $(SERVER) "systemctl start train"
	@echo "Deployed and restarted."
