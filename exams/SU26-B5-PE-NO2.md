# SDN302 – Practical Exam – SUMMER Block 5 – 2026 (NO2)

## INSTRUCTIONS

Please read the instructions carefully before answering the questions:

- You can use the materials on your computer, notebooks, and textbooks.
- You are **NOT allowed** to use electronic devices and other methods to share data with others.
- Do not arbitrarily disconnect the **FPTU_EXAMONLINE** network while doing the test. If any network problems occur, immediately notify the exam supervisor for assistance.

In addition to the above conditions, students must fulfill the following requirements:

1. Use **Visual Studio Code** (VS Code), **MongoDB Compass**, **Postman** tools to do the exam.
2. Use the available browser software on your computer.

**This part is very important, please read carefully and follow the instructions**

- You are provided with the files containing data in the **given** directory.
- You must use the solution provided in advance via email and install the additional library included in the accompanying request.
- You are **not allowed** to download any additional libraries while taking the test.
- Violating one of the above, your exam is considered invalid.

**Instructions for submission**

- Before submitting the solution, delete the **[node_modules]** folders in your test to reduce the space, to meet the allowed capacity of the **PEA_Client** software.
- Use **PEA_Client** software to browse the **resource** directory to complete the submission process.

---

## Database scheme

```
producer                 movie                        star
---------------          ------------------------     ------------------
_id: ObjectId   1 ──┐    _id: ObjectId           ┌──  _id: ObjectId
name: String        └──< producer: ObjectId      │    fullname: String
createdAt: Date     ┌──< director: ObjectId      │    male: Boolean
updatedAt: Date     │    title: String           │    dob: Date
                    │    release: Date           │    nationality: String
director            │    description: String     │    createdAt: Date
---------------     │    genres: [String]        │    updatedAt: Date
_id: ObjectId   1 ──┘    stars: [ObjectId] >─────┘
fullname: String         createdAt: Date
dob: Date                updatedAt: Date
nationality: String
createdAt: Date
updatedAt: Date
```

- `movie.producer` → `producer._id` (many movies : 1 producer)
- `movie.director` → `director._id` (many movies : 1 director)
- `movie.stars[]` → `star._id` (many : many)

## Requirements

Using **MongoDB Compass**, create a database named **"SDN302_SU26_B5"**. Create collections corresponding to the data in the **given** directory. Then, import data into the collections created in the database.

Using the given, build a RESTful API application that performs the requirements of the problem:

> **Note: 0 will be given to the work that**
> - Not using connection string to MongoDB in the **.env** file
> - Not configuring the root path of RESTful API Web App at: **http://localhost:9999**

---

## Question 1 (1.5 marks)

Create a new movie as shown in *Figure 1*, with the following API end-point parameters:

- URL: `http://localhost:9999/api/movie/create`
- Method: `POST`
- Input: a new movie object
- Example:

**Figure 1 – Send a request to create a new movie** (body: raw / JSON)

```json
{
    "title": "New movie",
    "release": "2024-05-10",
    "description": "Praesent blandit. Nam nulla. Integer pede justo, lacinia eget, tincidunt eget, tempus vel, pede.",
    "producer": "665f2cce86531e91c6e33c58",
    "director": "665f2fcb6b449f0d1437b6f8",
    "genres": [
        "Comedy",
        "Action"
    ],
    "stars": [
        "665f309c253b0c0839f666f0",
        "665f309c253b0c0839f666ee"
    ]
}
```

- The creation process was successful; the movie was saved to the database and returned data as shown in *Figure 2*.

**Figure 2 – Receive results response from the API after creating success** (`201 Created`)

```json
{
    "title": "New movie",
    "release": "2024-05-10T00:00:00.000Z",
    "description": "Praesent blandit. Nam nulla. Integer pede justo, lacinia eget, tincidunt eget, tempus vel, pede.",
    "producer": "665f2cce86531e91c6e33c58",
    "director": "665f2fcb6b449f0d1437b6f8",
    "genres": [
        "Comedy",
        "Action"
    ],
    "stars": [
        "665f309c253b0c0839f666f0",
        "665f309c253b0c0839f666ee"
    ],
    "_id": "6664a6fff4bf7e4f3328240b",
    "createdAt": "2024-06-08T18:46:23.283Z",
    "updatedAt": "2024-06-08T18:46:23.283Z",
    "__v": 0
}
```

- When creating a new movie without a **title** field, the result is shown in *Figure 3*.

**Figure 3 – Returns an error object when the title field is missing** (`500 Internal Server Error`)

```json
{
    "error": {
        "status": 500,
        "message": "movie validation failed: title: The movie title is required"
    }
}
```

- The movie genres only accept values including: **"Action, Drama, Comedy, Cartoon"**. If the data is incorrect, an error will be displayed as shown in *Figure 4*.

**Figure 4 – Returns an error object when the genres field has an incorrect value** (`500 Internal Server Error`)

```json
{
    "error": {
        "status": 500,
        "message": "movie validation failed: genres.0: Comedy 1 is not supported, genres.1: Action 2 is not supported"
    }
}
```

---

## Question 2 (2 marks)

List all movies as shown in *Figure 5*, with the following API endpoint parameters:

- URL: `http://localhost:9999/api/movie/list`
- Method: `GET`
- Example:

**Figure 5 – List of movies returned successfully** (`200 OK`, other items collapsed)

```json
[
    { ... },
    {
        "_id": "665f3dd57281d373d1a044d1",
        "title": "This Boy's Life",
        "release": "2024-05-28T00:00:00.000Z",
        "description": "Integer tincidunt ante vel ipsum. Praesent blandit lacinia erat.",
        "producer": "Cary Geely",
        "director": "Pepi Darcey",
        "genres": [
            "Drama",
            "Comedy"
        ],
        "stars": [
            "Fee Passo",
            "Mikael Ginnally",
            "Hugues MacKey"
        ]
    },
    { ... },
    { ... }
]
```

- Returns an array containing all the movies from the database.
- Display correct information of fields: **director** and **producer**.
- Display correct information of the **stars** field.

---

## Question 3 (2.5 marks)

List all movies by genre as shown in *Figure 6*, with the following API endpoint parameters:

- URL: `http://localhost:9999/api/movie/by-genre/:genre`
- Method: `GET`
- Example: `GET http://localhost:9999/api/movie/by-genre/Cartoon`

**Figure 6 – List of movies filtered by genre** (`200 OK`, other items collapsed)

```json
[
    {
        "_id": "665f3dd57281d373d1a044d0",
        "title": "Quartet",
        "release": "2024-05-25T00:00:00.000Z",
        "description": "Fusce posuere felis sed lacus. Morbi sem mauris, laoreet ut, rhoncus aliquet, pulvinar sed, nisl.",
        "producer": "Claire Lawry",
        "director": "Tish Latchmore",
        "genres": [
            "Comedy",
            "Cartoon",
            "Action"
        ],
        "stars": [
            "Mikael Ginnally",
            "Hugues MacKey",
            "Leeanne Dyson",
            "Fee Passo",
            "Magdalene Oswick"
        ]
    },
    { ... },
    { ... },
    { ... }
]
```

- Return all movies as required by the question.
- Display correct information of fields: **director** and **producer**.
- Display correct information of the **stars** field.
- If the genre is incorrect, return an error as shown in *Figure 7*.

**Figure 7 – The genre is incorrect** (`GET .../api/movie/by-genre/Cartoon123` → `404 Not Found`)

```json
{
    "error": {
        "status": 404,
        "message": "This movie genre does not exist"
    }
}
```

---

## Question 4 (2 marks)

Statistics of the number of movies by producer name as shown in *Figure 8*, with the following API endpoint parameters:

- URL: `http://localhost:9999/api/movie/count-by-producer/:producerName`
- Method: `GET`
- Example: `GET http://localhost:9999/api/movie/count-by-producer/Corie Awde`

**Figure 8 – Number of movies produced by "Corie Awde"** (`200 OK`)

```json
{
    "producer": "Corie Awde",
    "numberOfMovies": 4
}
```

- Correct number of movies by producer name.
- Display the correct format of the returned object.
- If the producer name does not exist, return the result as shown in *Figure 9*.

**Figure 9 – The producer name does not exist** (`GET .../api/movie/count-by-producer/Corie Awde123` → `404 Not Found`)

```json
{
    "error": {
        "status": 404,
        "message": "This producer name does not exist"
    }
}
```

---

## Question 5 (2 marks)

Remove a star from the corresponding movie according to **_id** as shown in *Figure 10*, with the following API endpoint parameters:

- URL: `http://localhost:9999/api/movie/:movieId/remove-star/:starId`
- Method: `PUT`
- Example:

**Figure 10 – Remove a star with _id = "665f309c253b0c0839f666f1" from movie with _id = "665f3dd57281d373d1a044d1"**

```
PUT http://localhost:9999/api/movie/665f3dd57281d373d1a044d1/remove-star/665f309c253b0c0839f666f1
```

- The process of removing a movie star is successful, returning the movie information after saving it to the database as shown in *Figure 11*.

**Figure 11 – The movie after remove a star** (`201 Created`)

```json
{
    "_id": "665f3dd57281d373d1a044d1",
    "title": "This Boy's Life",
    "release": "2024-05-28T00:00:00.000Z",
    "description": "Integer tincidunt ante vel ipsum. Praesent blandit lacinia erat.",
    "producer": "665f2caa86531e91c6e33c52",
    "director": "665f2fcb6b449f0d1437b6fd",
    "genres": [
        "Drama",
        "Comedy"
    ],
    "stars": [
        "665f309c253b0c0839f666ef",
        "665f309c253b0c0839f666f2"
    ],
    "createdAt": "2024-06-04T16:16:21.324Z",
    "updatedAt": "2024-06-09T16:58:40.207Z",
    "__v": 0
}
```
