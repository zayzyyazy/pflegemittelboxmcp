# Export calls

<!-- source: Export calls - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Quick schedule calls Send outbound sms
Powered by
Calls
Export calls
Export Call Data
This endpoint exports call data for a specific agent within a given date range, including call metadata, field values, and
extracted results. The data is returned as a CSV file suitable for analysis and reporting.
Request Body
The request accepts a JSON object with the following properties:
Response
On success, the endpoint returns:
CSV Format
The CSV file includes the following types of columns:
Excluded Data
To keep the export manageable, the following data is excluded:
Common Errors
Example
Usage with Scheduled Calls
This endpoint is particularly useful for analyzing outcomes of scheduled call campaigns. After scheduling calls with the
/calls/schedule endpoint, you can use this endpoint to export the results and track performance.
agent_id (UUID, required): The ID of the agent to export calls for
filters (object, required): Filtering criteria for the calls to export
start_datetime (string, required): Start of the date range (ISO8601 format)
end_datetime (string, required): End of the date range (ISO8601 format)
id (UUID, optional): Filter by specific call ID
status (string, optional): Filter by call status (e.g., “completed”, “failed”, “in_progress”)
customer_phone_number (string, optional): Filter by customer phone number
Status code: 200 OK
Content-Type: text/csv
Body: CSV data with call records
Base call data: Prefixed with uppercase column names (e.g., ID, DIRECTION, CREATED_AT)
Field values: Prefixed with FIELD_ and the field name (e.g., FIELD_CUSTOMER_NAME)
Result values: Prefixed with RESULT_ and the result name (e.g., RESULT_APPOINTMENT_CONFIRMED)
Complete transcript content (too large)
Internal system fields
Empty or null values
Private configuration fields
400 Bad Request: If the start date is after the end date
403 Forbidden: If you lack permissions to access the requested call data
404 Not Found: If no calls match the specified criteria
curl -X POST "https://api.leaping.ai/v1/calls/export" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "filters": {
      "start_datetime": "2025-04-01T00:00:00Z",
      "end_datetime": "2025-04-30T23:59:59Z",
      "status": "completed"
    }
  }'
Ask a question...
⌘I

