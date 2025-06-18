# Soup

## Description
The Soup Tool is a WebApp that allows the end user to create an Event Knowledge Graph (EKG) <br>
Starting from an event log, saved in a .csv file, the user is guided in the creation of the EKG with the aim of performing object-centric process mining analysis. <br>


## Tecnhnologies
### 1. Memgraph Database
As a Graph database for storing and manipulated event data.

Useful links: 
* [Memgraph](https://memgraph.com/) 
* [Chyper Query Language](https://neo4j.com/product/cypher-graph-query-language/?utm_source=google&utm_medium=PaidSearch&utm_campaign=GDB&utm_content=EMEA-X-Awareness-GDB-Text&utm_term=cypher%20query%20language&gad_source=1&gclid=CjwKCAiA9ourBhAVEiwA3L5RFhfAegfrPme8ND2NcBymbz8fhWHLrDI-HbSaK5lhBIA0kp-iR8ZZgRoC47wQAvD_BwE)

### 2. Python
The Backend is based on the Python programming language and the Flask library.

Useful links: 
* [Python](https://www.python.org/)
* [Flask](https://flask.palletsprojects.com/en/3.0.x/)
* [Neo4j Python library](https://neo4j.com/developer/python/)

### 3. Angular
The Angular framework is used as a frontend.  Within Angular, the dagre-d3 library has been used to create graphs based on nodes and relations.

Useful links: 
* [Angular](https://angular.io/)
* [Dagre-d3](https://www.npmjs.com/package/dagre-d3)

and other libraries in package.json.

## Tool Setup - Instructions

The first step is to clone the project: 

```
git clone https://github.com/soup-ocpm/soup.git
```

Make sure Git is installed on your computer. If Git is not installed, you will encounter an error message.

To download Git, visit the following page: [Download Git](https://git-scm.com/downloads)

### Start tool by Docker

First, install Docker inside your computer: [Download Docker](https://www.docker.com/get-started/)

After successfully installing Docker, open the terminal in the main folder of the cloned project.

Run the following commands from the terminal to create a Container in Docker made up of all the projects:<br>

```
docker-compose -p soup-tool up --build
```

OR (for Mac)

```
docker compose -p soup-tool up --build
```

Once the command is completed, Docker Compose automatically creates a container that includes the following sub-containers, all of which are already running:
* Angular container: represents the web tool, contactable at the `localhost:4200`
* Python container (Backend): represents the Backend and Engine of the system, contactable at the `localhost:8080`
* Memgraph container: in this container, the Memgraph database runs which offers 3 different ports.The most important is `localhost:3000` which will open Memgraph Lab.

## The Tool

This tool allows users to upload their own `.csv` files containing object-centric event data. After uploading, users can filter the data and map the file's columns to desired attributes.

Once mapping is complete, the server generates the graph of interest by executing queries on the Memgraph database. The resulting graph can then be: downloaded, filtered, aggregated based on custom attributes, and deleted if no longer needed.


> [!TIP]
> Please refer to the project [wiki](https://github.com/soup-ocpm/soup/wiki) for all the details.

📃You can download some event logs [here](https://github.com/soup-ocpm/soup-validation).

> [!WARNING]
> To avoid undesired bugs, please upload event logs without spaces in column headers.

> [!NOTE] 
> As required by Memgraph, the timestamp should be in the following formats (optionally with milliseconds): `YYYY-MM-DDThh:mm:ss` or `YYYY-MM-DDThh:mm` or `YYYYMMDDThhmmss` or `YYYYMMDDThhmm` or `YYYYMMDDThh`.


## Note
> 💭 Our tool is called _Soup_, with a logo showcasing a mix of rainbow noodles, symbolizing the dynamic and interconnected flow of object-centric process mining, much like the iconic image of rainbow spaghetti.

## Contact
* **Development support**: Alessio Giacché ✉️ ale.giacc.dev@gmail.com

* **Research activities**: Sara Pettinari ✉️ sara.pettinari@gssi.it & Lorenzo Rossi ✉️ lorenzo.rossi@unicam.it


## Feedback
We'd love to hear from you! Please share your feedback by filling out our form ➡️ [here](https://forms.gle/nBgZTeaDefTaYYkk9)


## Additional Features
More exciting features coming soon...🫕

