#!/bin/bash
# CantonTrace startup banner — prints after all services are healthy

echo ""
echo "  Waiting for services..."

# Wait for API gateway
for i in $(seq 1 60); do
  if wget -q --spider http://api-gateway:3001/api/v1/health 2>/dev/null; then
    break
  fi
  sleep 2
done

# Wait for Canton
for i in $(seq 1 30); do
  if wget -q --spider http://api-gateway:3001/api/v1/health 2>/dev/null; then
    break
  fi
  sleep 5
done

# Wait for demo data (parties > 1)
echo "  Waiting for demo data to be seeded..."
for i in $(seq 1 60); do
  PARTIES=$(wget -qO- http://api-gateway:3001/api/v1/sandboxes 2>/dev/null | grep -o '"parties":\[[^]]*\]' | head -1 | grep -o '::' | wc -l)
  if [ "$PARTIES" -ge 3 ] 2>/dev/null; then
    break
  fi
  sleep 3
done

cat << 'BANNER'

  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   CantonTrace is ready!                                  ║
  ║                                                          ║
  ╠══════════════════════════════════════════════════════════╣
  ║                                                          ║
  ║   🌐 App:        http://localhost:5174                   ║
  ║   🔒 App (SSL):  https://localhost     (self-signed)     ║
  ║   📡 API:        http://localhost:3001/api/v1            ║
  ║   📖 Swagger:    http://localhost:3001/documentation     ║
  ║                                                          ║
  ╠══════════════════════════════════════════════════════════╣
  ║                                                          ║
  ║   Quick Start:                                           ║
  ║                                                          ║
  ║   1. Open http://localhost:5174                          ║
  ║   2. Click the plug icon in the sidebar                  ║
  ║   3. Switch to "Sandbox" tab                             ║
  ║   4. Click "Demo Sandbox" → connects instantly           ║
  ║                                                          ║
  ║   The Demo sandbox comes pre-loaded with:                ║
  ║   • 4 parties: Alice, Bob, Charlie, Bank                 ║
  ║   • 18+ active contracts (tokens, agreements, etc.)      ║
  ║   • Transaction history with exercises & transfers       ║
  ║   • Intentional errors for the Error Debugger            ║
  ║                                                          ║
  ╠══════════════════════════════════════════════════════════╣
  ║                                                          ║
  ║   Services:                                              ║
  ║   • Canton 3.4.11    localhost:10000  (gRPC)             ║
  ║   • API Gateway      localhost:3001   (REST + WS)        ║
  ║   • Engine Service   internal:3002    (Daml LF Engine)   ║
  ║   • PostgreSQL       internal:5432    (Error KB)         ║
  ║   • Redis            internal:6379    (Cache)            ║
  ║                                                          ║
  ║   Stop:  docker compose down                             ║
  ║   Logs:  docker compose logs -f                          ║
  ║   Reset: docker compose down -v && docker compose up -d  ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝

BANNER
