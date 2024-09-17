# Soup

## Description
The Soup Tool is a WebApp that allows the end user to create an Event Knowledge Graph (EKG) <br>
Starting from an event log, saved in a .csv file, the user is guided in the creation of the EKG with the aim of performing object-centric process mining analysis. <br>

ℹ Please refer to the project [wiki](https://bitbucket.org/proslabteam/soup/wiki/Home) for all the details.

📃You can download some event logs [here](https://bitbucket.org/proslabteam/soup-validation/src/main/).

⚠ Notably, as required by Memgraph, the timestamp should be in the following formats (optionally with milliseconds): `YYYY-MM-DDThh:mm:ss` or `YYYY-MM-DDThh:mm` or `YYYYMMDDThhmmss` or `YYYYMMDDThhmm` or `YYYYMMDDThh`.

## Tecnhnologies
### 1. Memgraph Database
As a Graph database for storing and manipulated event data.
Useful links : 
- [Memgraph](https://memgraph.com/)
- [Chyper Query Language](https://neo4j.com/product/cypher-graph-query-language/?utm_source=google&utm_medium=PaidSearch&utm_campaign=GDB&utm_content=EMEA-X-Awareness-GDB-Text&utm_term=cypher%20query%20language&gad_source=1&gclid=CjwKCAiA9ourBhAVEiwA3L5RFhfAegfrPme8ND2NcBymbz8fhWHLrDI-HbSaK5lhBIA0kp-iR8ZZgRoC47wQAvD_BwE)

### 2. Python
The Backend is based on the Python programming language and the Flask library.
Useful links : 
- [Python](https://www.python.org/)
- [Flask](https://flask.palletsprojects.com/en/3.0.x/)
- [Neo4j Python library](https://neo4j.com/developer/python/)

### 3. Angular
The Angular framework is used as a frontend. 
Within Angular, the dagre-d3 library has been used to create graphs based on nodes and relations.
Useful links: 
- [Angular](https://angular.io/)
- [Dagre-d3](https://www.npmjs.com/package/dagre-d3)
and other library visible in package.json.

## Tool Setup - Instruction

The first step is to clone the project. <br> ([Clone a Git repository](https://support.atlassian.com/bitbucket-cloud/docs/clone-a-git-repository/))<br>

Make sure Git is installed on your computer. If Git is not installed, you will encounter an error message.

To download Git, visit the following page:

[Download Git](https://git-scm.com/downloads)

### Start tool by Docker
First, install Docker inside your computer.

[Download Docker](https://www.docker.com/get-started/)

After successfully installing Docker, open the terminal in the main folder of the cloned project.

Run the following commands from the terminal to create a Container in Docker made up of all the projects:<br>

```
docker-compose -p soup-tool up --build
```

Once the command is completed, Docker Compose automatically creates a container that includes the following sub-containers, all of which are already running:
- Angular container: represents the web tool, contactable at the <h4>localhost:4200</h4>
- Python container (Backend): represents the Backend and Engine of the system, contactable at the <h4>localhost:8080</h4>
- Memgraph container: in this container, the Memgraph database runs which offers 3 different ports.The most important is <h4>localhost:3000</h4>which will open Memgraph Lab.



## Use case
The tool allows the end user to upload a .csv file containing evet logs and create EKGs. <br>
First, go to the corresponding "Upload CSV" section and follow the tool's instructions to correctly upload the csv file. <br>
Once loaded, the file will be parsed and the user can see a preview of the entities and properties of the file through the table. <br>
A Sidebar coming from the right has the task of letting the user filter the entities and properties to take into consideration for his analysis.<br>

[Filter data](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen1.png)

Once this first phase is completed, the graph will be automatically generated within our Memgraph database and the graph data will be reported in the form of Cards, as illustrated:

[Cards data](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen2.png)

Then it is possible to expand the cards to see the corresponding and specific JSON of the newly created data, with the possibility of searching within the JSON or even downloading it : 

[Card visualization](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen3.png)

In the Sidebar coming from the right, the user can perform operations such as downloading the complete JSON of the Graph, deleting the graph or above all grouping the nodes <br> 
to create the graph composed of aggregate nodes (Class Graph). 

[Class graph](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen4.png)

Once the attributes to aggregate the nodes have been chosen, the Classes node will be created, and the user will automatically be redirected to the page which aims to view the complete graph. 

In this section, the user can navigate the graprh. Above all, it is possible to search fo nodes or relationships, and through the Sidebar you can carry out other <br> 
operations such as customizing the graph view, exporting the graph to .svg or deleting the graph.

[Search nodes](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen5.png)

[Change graph visualization](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen6.png)

At the top left there is an arrow to return to the previous screen. In this case the tool recognizes that an aggregate graph has already been created (or in any case is present within the Database)<br> 
so you have the possibility to see the graph or create a new one (the current graph will be eliminated).

[New class graph](https://bitbucket.org/proslabteam/soup/raw/c4753811b425eb364664e811c11c984a1b51c275/ekg_screenshots/screen7.png)


## Final Product
The user has the possibility to upload his own .csv file containing the data of interest via Drag&Drop. 
Once the .csv file is loaded, the user has the possibility to filter the data and therefore the columns of his .csv file.
Once this operation has been done (optional) the Server will begin to create the Graph of interest through queries to the Memgraph Database and will return the generated graph as a result. Obviously, the user has the possibility to download his graph in .svg format, as the possibility of eliminating it, but above all grouping the entities by Classes, in such a way as to obtain a new graph of interest.
All this achieved thanks to the Memgraph, Python and Angular libraries and documentation.

## Additional Features
### Causal Event Relationships
Soup supports the creation of EKGs considering event-to-event causal relationships.
Indeed, causal relationships allow to retrieve 1:n or n:1 relationships between events.

Revealing of such a relationship has been conducted in two case studies. Please refer to the corresponding [wiki](https://bitbucket.org/proslabteam/soup/wiki/CausalRelationships) page for more details.