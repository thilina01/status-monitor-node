#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Fetch docker stats in JSON format and aggregate into an array
stats=$(docker stats --no-stream --format '{{json .}}' | jq -s '.')

# Fetch docker ps information in JSON format and aggregate into an array
ps=$(docker ps --format '{{json .}}' | jq -s '.')

# Collect Docker container statuses, health, and uptime
docker ps --format "{{.Names}} {{.Status}}" \
  | awk 'BEGIN {
      # Get the current time in ISO 8601 format (local time)
      command="date +\"%Y-%m-%dT%H:%M:%S\""
      command | getline exec_time
      close(command)

      # Print the beginning of the JSON
      print "{\"execution_time\": \"" exec_time "\","
      print "\"total_services\": 0,"
      print "\"services\": ["
    }
    {
        # Extract full container name
        full_name=$1;

        # Remove Docker Swarm service identifiers (anything after the first underscore)
        sub(/_[^.]+.[^.]+.[^.]+$/, "", full_name);

        # Initialize variables
        status="up";
        uptime="unknown";
        start_processing_uptime=0;

        # Process status and uptime fields
        for (i=2; i<=NF; i++) {
            if ($i ~ /\(healthy\)/) {
                status="healthy";
            } else if ($i ~ /\(unhealthy\)/) {
                status="unhealthy";
            } else if ($i == "Up") {
                start_processing_uptime=1;
                uptime="";
            } else if (start_processing_uptime) {
                uptime = (uptime == "" ? $i : uptime " " $i);
            }
        }

        # Print JSON entry
        if (NR > 1) print ",";
        printf "{\"name\": \"%s\", \"status\": \"%s\", \"uptime\": \"%s\"}", full_name, status, uptime;

        total_services++;
    }
    END {
        print "],"
        print "\"total_services\": " total_services
        print "}"
    }'
# Check if both stats and ps have data
if [ -z "$stats" ] || [ "$stats" == "null" ] || [ "$stats" == "[]" ]; then
  echo "No data retrieved from 'docker stats'. Ensure containers are running."
  exit 1
fi

if [ -z "$ps" ] || [ "$ps" == "null" ] || [ "$ps" == "[]" ]; then
  echo "No data retrieved from 'docker ps'. Ensure containers are running."
  exit 1
fi

# Create a map from docker ps with container ID as key, including full Status
ps_map=$(echo "$ps" | jq 'map({(.ID): {Status: .Status, RunningFor: .RunningFor}}) | add')

# Combine the two JSON arrays using jq, matching by container ID
combined=$(echo "$stats" | jq --argjson ps_map "$ps_map" '
  map(
    # Determine the status based on the presence of "healthy" or "unhealthy" in the Status field
    .status = (
      if ($ps_map[.Container].Status | contains("healthy")) then "healthy"
      elif ($ps_map[.Container].Status | contains("unhealthy")) then "unhealthy"
      else "up"
      end
    ) |
    
    # Extract the uptime from the RunningFor field and remove " ago"
    .uptime = (
      ($ps_map[.Container].RunningFor // "Unknown") 
      | sub(" ago$"; "")
    ) |
    
    # Extract only the service name from the full container name
    .Name = (
      if (.Name | contains("_")) then
        (.Name | split("_")[-1] | split(".")[0])
      else
        .Name
      end
    ) |
    
    # Select the desired fields for the final output
    {Name, CPUPerc, MemUsage, MemPerc, NetIO, status, uptime}
  )
')

# Output the combined JSON
echo "$combined"
