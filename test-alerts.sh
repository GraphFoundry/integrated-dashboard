#!/bin/bash

# Test script for the Alerts Dashboard
# Sends sample alert events to the BFF webhook endpoint

BFF_URL="${BFF_URL:-http://localhost:3001}"

echo "🔧 Testing Alerts Dashboard BFF"
echo "BFF URL: $BFF_URL"
echo ""

# Test 1: Critical alert - Payment service high latency
echo "📤 Test 1: Critical payment service alert..."
curl -X POST "$BFF_URL/ingest/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "alerts.v1",
    "event_id": "test-001",
    "dedupe_key": "high-latency-payment",
    "observed_at": "2026-01-04T10:30:00Z",
    "sent_at": "2026-01-04T10:30:01Z",
    "service": {
      "name": "payment-service",
      "namespace": "default"
    },
    "alert": {
      "type": "latency",
      "state": "firing",
      "severity": "critical"
    },
    "decision": {
      "action": "scale_up",
      "auto": true,
      "priority": "P1",
      "risk_score": 95,
      "reason_codes": ["latency_breach", "high_traffic", "error_spike"]
    },
    "evidence": {
      "latency_p99": 3500,
      "http_errors": 78,
      "cpu_percent": 85
    },
    "impact": {
      "downstream_count": 3
    },
    "context": {
      "pod_name": "payment-7d4f8",
      "cluster": "prod-us-east",
      "environment": "production"
    },
    "links": {
      "runbook": "https://wiki/runbooks/payment-scale",
      "dashboard": "https://grafana/d/payment"
    },
    "meta": {
      "model_version": "v2.0-hybrid",
      "threshold_version": "2026-01-02"
    }
  }'
echo -e "\n✅ Test 1 complete\n"

sleep 1

# Test 2: High severity alert - User service
echo "📤 Test 2: High severity user service alert..."
curl -X POST "$BFF_URL/ingest/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "alerts.v1",
    "event_id": "test-002",
    "dedupe_key": "database-connection-user",
    "observed_at": "2026-01-04T10:32:00Z",
    "sent_at": "2026-01-04T10:32:01Z",
    "service": {
      "name": "user-service",
      "namespace": "default"
    },
    "alert": {
      "type": "database",
      "state": "firing",
      "severity": "high"
    },
    "decision": {
      "action": "restart_connections",
      "auto": false,
      "priority": "P1",
      "risk_score": 75,
      "reason_codes": ["connection_pool_exhausted", "slow_queries"]
    },
    "evidence": {
      "active_connections": 98,
      "max_connections": 100,
      "query_latency_p95": 1200
    },
    "impact": {
      "downstream_count": 5
    },
    "context": {
      "pod_name": "user-service-abc123",
      "cluster": "prod-us-west",
      "database": "users-primary"
    },
    "links": {
      "runbook": "https://wiki/runbooks/db-connections",
      "details_ref": "https://grafana/d/database"
    },
    "meta": {
      "model_version": "v2.0-hybrid"
    }
  }'
echo -e "\n✅ Test 2 complete\n"

sleep 1

# Test 3: Medium severity - Order service
echo "📤 Test 3: Medium severity order service alert..."
curl -X POST "$BFF_URL/ingest/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "alerts.v1",
    "event_id": "test-003",
    "dedupe_key": "cache-miss-orders",
    "observed_at": "2026-01-04T10:35:00Z",
    "sent_at": "2026-01-04T10:35:01Z",
    "service": {
      "name": "order-service",
      "namespace": "production"
    },
    "alert": {
      "type": "performance",
      "state": "firing",
      "severity": "medium"
    },
    "decision": {
      "action": "warm_cache",
      "auto": true,
      "priority": "P2",
      "risk_score": 45,
      "reason_codes": ["cache_miss_rate_high"]
    },
    "evidence": {
      "cache_hit_rate": 45,
      "cache_miss_rate": 55,
      "latency_p99": 850
    },
    "impact": {
      "downstream_count": 2
    },
    "context": {
      "pod_name": "order-xyz789",
      "cluster": "prod-eu-central"
    },
    "links": {
      "dashboard": "https://grafana/d/orders"
    },
    "meta": {
      "model_version": "v2.0-hybrid"
    }
  }'
echo -e "\n✅ Test 3 complete\n"

sleep 1

# Test 4: Update first alert with more evidence
echo "📤 Test 4: Update payment service alert (second event)..."
curl -X POST "$BFF_URL/ingest/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "alerts.v1",
    "event_id": "test-004",
    "dedupe_key": "high-latency-payment",
    "observed_at": "2026-01-04T10:40:00Z",
    "sent_at": "2026-01-04T10:40:01Z",
    "service": {
      "name": "payment-service",
      "namespace": "default"
    },
    "alert": {
      "type": "latency",
      "state": "firing",
      "severity": "critical"
    },
    "decision": {
      "action": "scale_up",
      "auto": true,
      "priority": "P1",
      "risk_score": 98,
      "reason_codes": ["latency_breach", "high_traffic", "error_spike", "memory_pressure"]
    },
    "evidence": {
      "latency_p99": 4200,
      "http_errors": 125,
      "cpu_percent": 92,
      "memory_percent": 88
    },
    "impact": {
      "downstream_count": 5
    },
    "context": {
      "pod_name": "payment-7d4f8",
      "cluster": "prod-us-east",
      "environment": "production"
    },
    "links": {
      "runbook": "https://wiki/runbooks/payment-scale",
      "dashboard": "https://grafana/d/payment"
    },
    "meta": {
      "model_version": "v2.0-hybrid",
      "trace_id": "abc123xyz"
    }
  }'
echo -e "\n✅ Test 4 complete\n"

sleep 1

# Test 5: Resolve the user service alert
echo "📤 Test 5: Resolve user service alert..."
curl -X POST "$BFF_URL/ingest/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_version": "alerts.v1",
    "event_id": "test-005",
    "dedupe_key": "database-connection-user",
    "observed_at": "2026-01-04T10:45:00Z",
    "sent_at": "2026-01-04T10:45:01Z",
    "service": {
      "name": "user-service",
      "namespace": "default"
    },
    "alert": {
      "type": "database",
      "state": "resolved",
      "severity": "info"
    },
    "decision": {
      "action": "none",
      "auto": true,
      "priority": "P3",
      "risk_score": 10,
      "reason_codes": ["connections_recovered"]
    },
    "evidence": {
      "active_connections": 45,
      "max_connections": 100,
      "query_latency_p95": 150
    },
    "impact": {
      "downstream_count": 0
    },
    "context": {
      "pod_name": "user-service-abc123",
      "cluster": "prod-us-west",
      "database": "users-primary"
    },
    "links": {
      "runbook": "https://wiki/runbooks/db-connections"
    },
    "meta": {
      "model_version": "v2.0-hybrid"
    }
  }'
echo -e "\n✅ Test 5 complete\n"

sleep 1

# Fetch stats
echo "📊 Fetching stats..."
curl -s "$BFF_URL/api/stats" | jq '.'
echo ""

echo "✅ All tests complete!"
echo ""
echo "🌐 View the dashboard at: http://localhost:5173/alerts"
echo "📡 WebSocket connections: $(curl -s "$BFF_URL/api/stats" | jq -r '.ws_connections')"
