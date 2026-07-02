# Create phone deployment

<!-- source: Create phone deployment - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Send outbound sms Get regions
Powered by
Deployments
Create phone deployment
Create Phone Deployment
This endpoint creates a new phone deployment, linking an agent snapshot to a phone number within a
specific region. This is how you make your conversational agents available to handle phone calls.
Request Body
The request accepts a JSON object with the following properties:
Traffic Distribution
The traffic_proportion values in the snapshot_traffic_distribution array must sum to 1.0. This
allows for:
Response
On success, the endpoint returns an array of PhoneDeployment objects, each containing:
Available Regions
Leaping AI currently supports two regions for phone deployments:
Choose the region closest to your callers to minimize latency and improve call quality.
Example
Example: A/B Testing
To deploy two different agent snapshots with a 90/10 split:
snapshot_traffic_distribution (array, required): An array of objects defining the agent snapshots to
deploy and their traffic distribution
agent_snapshot_id (UUID, required): The ID of the agent snapshot to deploy
traffic_proportion (number, required): The proportion of traffic this snapshot should receive
(between 0 and 1)
phone_id (UUID, required): The ID of the phone number to use for this deployment
region (string, required): The region where this deployment should be created (either “eastus” or
“sweden”)
A/B testing different agent versions
Gradual rollout of new agent versions
Canary deployments to test changes with a small percentage of traffic
agent_snapshot_id (UUID): The ID of the deployed agent snapshot
traffic_proportion (number): The proportion of traffic routed to this snapshot
phone_id (UUID): The ID of the phone number
inbound_call_url (string): The URL that handles inbound calls
eastus: Deployed in Azure East US 2 (Virginia), optimized for North American callers
sweden: Deployed in Azure Sweden Central, optimized for European callers
curl -X POST "https://api.leaping.ai/v1/deployments/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_traffic_distribution": [
      {
        "agent_snapshot_id": "550e8400-e29b-41d4-a716-446655440000",
        "traffic_proportion": 1.0
      }
    ],
    "phone_id": "a385a208-7b1a-4d27-8c08-a35d7e1f72c2",
    "region": "eastus"
  }'
curl -X POST "https://api.leaping.ai/v1/deployments/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_traffic_distribution": [
      {
        "agent_snapshot_id": "550e8400-e29b-41d4-a716-446655440000",
        "traffic_proportion": 0.9
      },
      {
        "agent_snapshot_id": "550e8400-e29b-41d4-a716-446655440001",
        "traffic_proportion": 0.1
      }
    ],
    "phone_id": "a385a208-7b1a-4d27-8c08-a35d7e1f72c2",
    "region": "sweden"
  }'
Ask a question...
⌘I

