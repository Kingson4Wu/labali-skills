.PHONY: setup validate

setup:
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@echo "Git hooks configured. Pre-commit checks are now active."

validate:
	python3 scripts/validate_all.py
	python3 scripts/check_chinese.py
