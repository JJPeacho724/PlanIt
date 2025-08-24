SHELL := /bin/bash

.PHONY: bootstrap dev build prisma-generate prisma-migrate prisma-studio shadcn-add lint

bootstrap:
	npm install
	npm run prisma-generate -w @acme/web || true

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

prisma-generate:
	npm run prisma:generate -w @acme/web

prisma-migrate:
	npm run prisma:migrate -w @acme/web

prisma-studio:
	npm run prisma:studio -w @acme/web

shadcn-add:
	npm run shadcn -w @acme/web -- add $$c

