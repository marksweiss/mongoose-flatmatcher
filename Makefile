TESTS = $(shell find test -name '*.test.js')

test:
		$(TESTS)

.PHONY: test