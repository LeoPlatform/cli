LeoPlatform/cli
===================

Leo CLI

A Nodejs interface to interact with the Leo SDK and AWS

Documentation: https://docs.leoplatform.io

How to install the Leo SDK
===================================

Pre-Requisites
--------------
1. Install the aws-cli toolkit - Instructions for this are found at http://docs.aws.amazon.com/cli/latest/userguide/installing.html
2. Configure the aws-cli tools - Instructions are found at http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html
3. Install node - https://nodejs.org/en/

Install SDK
-----------
1. Install using npm.  In your project folder run the following command.

```
npm install leo-cli -g
```

How to use the Leo SDK
===================================

Create a System
---------------

```
leo-cli create system MySystem
```

Create a Microservice
---------------
Inside a system directory

```
leo-cli create microservice MyService
```


Build Bots & Apis
-----------------
Inside a microservice directory

```
leo-cli create load MyLoadBot
leo-cli create enrich MyEnrichBot
leo-cli create offload MyOffloadBot
leo-cli create bot MyBot
leo-cli create cron MyCronBot
```

Testing Bots & Apis
-------------------
Inside the bot or resource directory

```
leo-cli test .
```

Runing Bots
-----------
Inside the bot or resource directory

```
leo-cli run .
```

Deploying Microservices, Bots, & Apis
-------------------------------------

```
leo-cli publish .
```

options
	* --region awsRegion			Sets the AWS Region. default: us-west-2
	* --filter idGlobExp			Filters the lambdas deployed by the given glob expression. default: *
	* --force botId|all				Forces a bot to build event if version are the same (Must be included in --filter expression). default: false
	* --run awsStackName			Runs the generated cloudformation.json against the AWS Stack 'awsStackName'.  If the stack doesn't exist, it will be crated
	* --build						Builds the cloudformation and lambdas but doesn't publish them to s3
	* --public						Makes the s3 publish folder public

Version of the build using the microservice/bot/api package.json file.  If a bot/api is forced to be built and has the same version number the current timestamp will be appended to he version

Deploy Examples
---------------

Publish a Microservice with all new/updated bots & apis

```
cd /MySystem/MyService
leo-cli publish . 
```  


Publish a Microservice and force all bots & apis to build

```
cd /MySystem/MyService
leo-cli publish . 
```  


Publish a single bot in a Microservice

```
cd /MySystem/MyService/Bot1
leo-cli publish . 
```  


Publish a single bot or resource in a Microservice

```
cd /MySystem/MyService/Bot1
leo-cli publish . 
```  

```
cd /MySystem/MyService
leo-cli publish . --filter Bot1
```  

