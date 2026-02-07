.PHONY: build clean flash build-and-flash help

help:
	@echo "Available targets:"
	@echo "  make build           - Clean build, configure with CMake, and compile with Ninja"
	@echo "  make clean           - Remove build directory"
	@echo "  make flash           - Flash the compiled firmware to the device"
	@echo "  make build-and-flash - Build and flash in one command"
	@echo ""
	@echo "Use pnpm scripts for higher-level workflows:"
	@echo "  pnpm build:all       - Build firmwares for all boards into dist/"
	@echo "  pnpm publish         - Build and upload firmwares to R2"

build: clean
	cmake -S . -B build -G "Ninja"
	ninja -C build

clean:
	rm -rf build

flash:
	picotool load build/devicesdk-client.elf -fx

build-and-flash: build flash
