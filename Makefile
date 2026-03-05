-include deploy.local.mk

SERVER?=root@192.168.1.119
DEPLOY_PATH?=/opt/train

build:
	GOOS=linux GOARCH=amd64 go build -o train .

deploy: build
	ssh $(SERVER) "systemctl stop train && mkdir -p $(DEPLOY_PATH)/db"
	scp train $(SERVER):$(DEPLOY_PATH)/train
	scp -r public $(SERVER):$(DEPLOY_PATH)/
	scp db/schema.sql $(SERVER):$(DEPLOY_PATH)/db/schema.sql
	ssh $(SERVER) "systemctl start train"
	@echo "Deployed and restarted."
