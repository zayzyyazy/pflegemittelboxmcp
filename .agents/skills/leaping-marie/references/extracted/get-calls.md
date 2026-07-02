# Get calls

<!-- source: Get calls - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Login Schedule calls
Powered by
Calls
Get calls
Get Agent Calls
This endpoint retrieves a list of agent calls with optional filtering and pagination. Use this endpoint to query call records for a
specific agent and analyze call history, performance, and outcomes.
Query Parameters
Response
On success, the endpoint returns:
Pagination
Use the offset and limit parameters to paginate through large result sets:
Filtering by Date Range
When filtering by date range, both start_date and end_date accept ISO8601 formatted datetime strings:
Common Errors
Example
Usage with Call Analytics
This endpoint is essential for building call analytics dashboards and monitoring agent performance. Combine it with date range
filtering to analyze call volume trends, success rates, and other key metrics over time.
agent_id (UUID, required): The ID of the agent to retrieve calls for
in_progress_only (boolean, optional): Filter to only return calls that are currently in progress
id (string, optional): Filter by specific call ID
phone_number (string, optional): Filter by customer phone number. Matches a substring of the customer’s phone number
after stripping all non-digit characters from both sides, so (555) 123-4567, 5551234567, and +1 555 123 4567 all
match the stored E.164 form +15551234567.
status (string, optional): Filter by call status (e.g., “completed”, “failed”, “in_progress”)
start_date (datetime, optional): Filter calls created after this date (ISO8601 format)
end_date (datetime, optional): Filter calls created before this date (ISO8601 format)
tag (string, optional): Filter by call tag
order_by (string, optional): Order results by field. Options: “created_at”, “ended_at” (default: “created_at”)
offset (integer, optional): Number of records to skip for pagination (default: 0)
limit (integer, optional): Maximum number of records to return (default: 100)
snapshot_ids (array of UUIDs, optional): Filter by specific agent snapshot IDs
select (array of strings, optional): Specify which fields to include in the response
results (string, optional): Filter by call results
Status code: 200 OK
Body: JSON object containing:
calls: Array of call records matching the specified criteria
total_count: Total number of calls matching the filters (useful for pagination)
offset: Skip this many records
limit: Return at most this many records
total_count: Use this to calculate total pages
start_date: Include calls created on or after this date
end_date: Include calls created on or before this date
422 Unprocessable Entity: If query parameters contain invalid data
403 Forbidden: If you lack permissions to access the requested call data
404 Not Found: If the specified agent doesn’t exist
curl -X GET "https://api.leaping.ai/v1/calls/?agent_id=550e8400-e29b-41d4-a716-446655440000&status=completed&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
Ask a question...
⌘I

