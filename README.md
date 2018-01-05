LeoPlatform/cli
===================

Leo CLI

A Nodejs interface to interact with the Leo SDK and AWS

Documentation: https://docs.leoplatform.io

How to install the Leo CLI
===================================

Pre-Requisites
--------------
1. Install the aws-cli toolkit - Instructions for this are found at http://docs.aws.amazon.com/cli/latest/userguide/installing.html
2. Configure the aws-cli tools - Instructions are found at http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html
3. Install node - https://nodejs.org/en/

Install CLI
-----------
1. Install using npm.  In your project folder run the following command.

```
npm install leo-cli -g
```

How to use the Leo CLI
===================================

Create a System
---------------
A system is the root directory for a group of microservices & bots.  This command will create a directory for the system.

```
leo-cli create system MySystem
```

Create a Microservice
---------------
Microservices must be created inside a system directory

```
cd /MySystem
leo-cli create microservice MyService
```


Build Bots
-----------------
Bots must be created inside a microservice directory

```
cd /MySystem/MyService
leo-cli create load MyLoadBot
leo-cli create enrich MyEnrichBot
leo-cli create offload MyOffloadBot
leo-cli create bot MyBot
leo-cli create cron MyCronBot
```

Testing Bots
-------------------
Inside a bot directory

```
cd /MySystem/MyService/bots/MyBot
leo-cli test .
```

Runing Bots
-----------
Inside a bot or resource directory

```
cd /MySystem/MyService/bots/MyBot
leo-cli run .
```

Publishing Microservices & Bots
-------------------------------------
Publishing a microservice will build all needed lambda functions into zip files and a cloudformation file.  Those files are then uploaded to your publish s3 bucket.

The publish command must be run from a micorservice or bot directory

```
leo-cli publish .
```

options
* **--region awsRegion**			Sets the AWS Region. default: us-west-2
* **--filter idGlobExp**			Filters the lambdas deployed by the given glob expression. default: *
* **--force botId|all**				Forces a bot to build even if the versions are the same (Must be included in --filter expression). default: false
* **--run awsStackName**			Runs the generated cloudformation.json against the AWS Stack 'awsStackName'.  If the stack doesn't exist, it will be crated
* **--build**						Builds the cloudformation and lambdas but doesn't publish them to s3
* **--public**						Makes the s3 publish folder public

Version of the build using the microservice or bot package.json file.  If a bot is forced to be built and has the same version number the current timestamp will be appended to he version

Deploy Examples
---------------

Publish a Microservice with all new/updated bots

```
cd /MySystem/MyService
leo-cli publish . 
```  


Publish a Microservice and force all bots to build

```
cd /MySystem/MyService
leo-cli publish . --force all
```  


Publish a single bot in a Microservice

```
cd /MySystem/MyService/bots/MyBot
leo-cli publish . 
```  


Publish a single bot or resource in a Microservice

```
cd /MySystem/MyService/bots/MyBot
leo-cli publish . 
```  

```
cd /MySystem/MyService
leo-cli publish . --filter MyBot
```  


Deploying a Microservices to AWS
-------------------------------------

The deploy command can only be run after a microservice has been published.  You must be inside a microservice directory to deploy.

The second parameter is the name of the AWS Stack for the microservice.

```
cd /MySystem/MyService
leo-cli deploy . TestMyService
leo-cli deploy . StageMyService
leo-cli deploy . ProdMyService
```

