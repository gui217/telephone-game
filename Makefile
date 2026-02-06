.PHONY: install install-frontend install-backend

# Install both frontend and backend dependencies
install: install-frontend install-backend

# Frontend: npm install
install-frontend:
	cd frontend && npm install

# Backend: create venv if missing, then pip install
install-backend:
	@if [ ! -d backend/venv ]; then \
		echo "Creating backend virtualenv..."; \
		python3 -m venv backend/venv; \
	fi
	backend/venv/bin/pip install --upgrade pip
	backend/venv/bin/pip install -r backend/requirements.txt
