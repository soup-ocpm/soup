# Soup

![Angular](https://img.shields.io/badge/Angular-v18.2.0-DD0031?style=flat&logo=angular&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11.5-3776AB?style=flat&logo=python&logoColor=white)
![Memgraph](https://img.shields.io/badge/Memgraph-v3.3.0-000000%3Fstyle%3Dflat%26logo%3Dmemgraph%26logoColor%3Dwhite?color=orange)

## Description
**SOUP** is a web application that enables users to create an **Event Knowledge Graph (EKG)** from their own event logs.

Starting from a `.csv` file containing object-centric event data, the tool guides the user through the EKG creation process, with the goal of supporting **object-centric process mining** analysis in an intuitive and efficient way.

---

## Tecnhnologies

| Role in SOUP                                    | Useful Links |
|------------------|--------------|
| Graph database used to store and query the EKG | [Memgraph](https://memgraph.com/) <br> [Cypher Query Language](https://neo4j.com/product/cypher-graph-query-language/) |
| Backend logic and API layer                     | [Python](https://www.python.org/) <br> [Flask](https://flask.palletsprojects.com/en/3.0.x/) <br> [Neo4j Python Driver](https://neo4j.com/developer/python/) |
| Frontend and graph rendering       | [Angular](https://angular.io/) <br> [Dagre-d3](https://www.npmjs.com/package/dagre-d3) |
| Other supporting libraries and tools                  | See `package.json` for full list |

---

## Tool Setup - Instructions

First, ensure [Git](https://git-scm.com/downloads) is installed on your machine. Then, open your terminal and run:

```
git clone https://github.com/soup-ocpm/soup.git
```

Make sure Git is installed on your computer. If Git is not installed, you’ll see an error — install it from the link above before proceeding.

### Start the tool via Docker

First, install Docker on your computer: [Download Docker](https://www.docker.com/get-started/)

Once Docker is installed, open your terminal in the root directory of the cloned project and run:

```
docker-compose -p soup-tool up --build
```

> 💡 Mac users (and newer Docker versions) may need to run:
  ```
  docker compose -p soup-tool up --build
  ```

Docker Compose will spin up the following containers:

| Container        | Description                                  | Access Point                   |
|------------------|----------------------------------------------|--------------------------------|
| **Angular**    | Frontend WebApp                              | [http://localhost:4200](http://localhost:4200) |
| **Python/Flask** | Backend logic and API engine                 | [http://localhost:8080](http://localhost:8080) |
| **Memgraph**   | Graph DB for storing and querying EKGs       | [http://localhost:3000](http://localhost:3000) *(Memgraph Lab)* |



You’re now ready to start using SOUP! 🎉

---

## The Tool

**SOUP** is a user-friendly web application to work with object-centric event data in `.csv` format. It allows you to:

1. **Upload** your event log file.
2. **Filter and map** columns to the appropriate event attributes.
3. **Automatically generate** an Event Knowledge Graph (EKG) using the Memgraph database.
4. **Explore and manipulate** the graph through:
   - **Filtering** (e.g., timestamps, frequency, performance)
   - **Aggregating** nodes into classes
   - **Exporting** to `.svg` or `.json`
   - **Deleting** graphs when no longer needed

---

> [!TIP]
> Please refer to the project [wiki](https://github.com/soup-ocpm/soup/wiki) for all the details additionally you can download some event logs [here](https://github.com/soup-ocpm/soup-validation).

---

> [!WARNING]
> Make sure your `.csv` file **does not contain spaces** in the column headers to avoid parsing issues.

---

> [!NOTE]   
> **Timestamp Format Requirements**: Memgraph accepts the following timestamp formats (with optional milliseconds): `YYYY-MM-DDThh:mm:ss` or `YYYY-MM-DDThh:mm` or `YYYYMMDDThhmmss` or `YYYYMMDDThhmm` or `YYYYMMDDThh`.

---

## Note
> 💭 Our tool is called _Soup_, with a logo showcasing a mix of rainbow noodles, symbolizing the dynamic and interconnected flow of object-centric process mining, much like the iconic image of rainbow spaghetti.

## Contact
* **Development support**: Alessio Giacché ✉️ ale.giacc.dev@gmail.com

* **Research activities**: Sara Pettinari ✉️ sara.pettinari@gssi.it & Lorenzo Rossi ✉️ lorenzo.rossi@unicam.it


## Feedback
We'd love to hear from you! Please share your feedback by filling out our form ➡️ [here](https://forms.gle/nBgZTeaDefTaYYkk9)


## Additional Features
More exciting features coming soon...🫕

