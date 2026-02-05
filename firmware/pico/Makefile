.PHONY: build clean flash build-and-flash publish publish-build install-publish-deps help

help:
	@echo "Available targets:"
	@echo "  make build              - Clean build, configure with CMake, and compile with Ninja"
	@echo "  make clean              - Remove build directory"
	@echo "  make flash              - Flash the compiled firmware to the device"
	@echo "  make build-and-flash    - Build and flash in one command"
	@echo "  make publish            - Build firmwares and upload to Cloudflare R2"
	@echo "  make publish-build      - Build firmwares into dist/ without uploading"
	@echo "  make install-publish-deps - Install Node.js dependencies for publishing"
	@echo ""
	@echo "Environment variables for publish:"
	@echo "  CF_ACCOUNT_ID           - Cloudflare account ID"
	@echo "  CF_R2_ACCESS_KEY_ID     - R2 API token access key ID"
	@echo "  CF_R2_SECRET_ACCESS_KEY - R2 API token secret access key"

build: clean
	cmake -S . -B build -G "Ninja"
	ninja -C build

clean:
	rm -rf build

flash:
	picotool load build/devicesdk-client.elf -fx

build-and-flash: build flash

install-publish-deps:
	cd scripts && pnpm install

publish-build:
	rm -rf dist
	mkdir -p dist
	IOTKIT_BOARD=pico_w $(MAKE) build
	cp build/devicesdk-client.uf2 dist/devicesdk-pico-w-client.uf2
	IOTKIT_BOARD=pico2_w $(MAKE) build
	cp build/devicesdk-client.uf2 dist/devicesdk-pico2-w-client.uf2

publish: publish-build
	@if [ ! -d "scripts/node_modules" ]; then \
		echo "Installing publish dependencies..."; \
		cd scripts && pnpm install; \
	fi
	node scripts/publish.js $(CURDIR)/dist
