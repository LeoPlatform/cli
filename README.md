LeoPlatform/cli
===================

Leo CLI

A Nodejs interface to interact with the Leo SDK and AWS

Quick Start Guide: https://github.com/LeoPlatform/Leo

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

At this point, we recommend following the [Quick Start instructions](https://github.com/LeoPlatform/Leo#step-3-create-a-quickstart-project) to create a project shell with example bots.

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
leo-cli publish
```
##### Note:
As of version 2.0.0, leo_cli_config.js and leo_config.js are required to be able to publish.

options
* **-e --env [environment]**        Environment.
* **-cs --changeset**               Only build Changeset.
* **-c**                            Only build cloudformation.
* **-d --deploy [environment]**     Deploy the published cloudformation.
* **-f all --force all**            Force publish and deploy of all bots, including ones without changes.
* **--filter idGlobExp**			Filters the lambdas deployed by the given glob expression. default: *
* **--run awsStackName**			Runs the generated cloudformation.json against the AWS Stack 'awsStackName'.  If the stack doesn't exist, it will be crated
* **--build**						Builds the cloudformation and lambdas but doesn't publish them to s3
* **--public**						Makes the s3 publish folder public

Version of the build using the microservice or bot package.json file.  If a bot is forced to be built and has the same version number the current timestamp will be appended to he version

Deploy Examples
---------------

Publish a Microservice with all new/updated bots

```
cd /MySystem/MyService
leo-cli publish 
```  


Publish a Microservice and force all bots to build

```
cd /MySystem/MyService
leo-cli publish --force all
```  


Publish a single bot in a Microservice

```
cd /MySystem/MyService/bots/MyBot
leo-cli publish
```  


Publish a single bot or resource in a Microservice

```
cd /MySystem/MyService/bots/MyBot
leo-cli publish 
```  

```
cd /MySystem/MyService
leo-cli publish --filter MyBot
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

# Support
Want to hire an expert, or need technical support? Reach out to the Leo team: https://leoinsights.com/contact
