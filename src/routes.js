const router = require('express').Router()
const { json } = require('express')
const path = require('path')

// Requiring Ltijs
const lti = require('ltijs').Provider

// Grading route
router.post('/grade', async (req, res) => {
  try {
    const api_token = JSON.parse(process.env.USER_CODEFUN)
    let id_token = Math.floor(Math.random() * api_token.length)
    const code = req.body.code
    const idtoken = res.locals.token // IdToken
    const { custom } = idtoken.platformContext
    //create a new json object to store the code
    const urlEncodedData = new URLSearchParams({
      code: code,
      problem: custom.problem,
      language: custom.language
    }).toString();
    
    //fetch token from codefun/api/auth with api_token[id_token][0] and api_token[id_token][1] as username and password x-www-form-urlencoded
    const urlEncodedUser = new URLSearchParams({
      username: api_token[id_token][0],
      password: api_token[id_token][1]
    }).toString();

    const token = await fetch( process.env.CODEFUN_API_URL + "/auth", {
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: urlEncodedUser
    }); 

    const tokenData = await token.json();

    const submission_id = await fetch(process.env.CODEFUN_API_URL + "/submit", {
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${tokenData.data}`
      },
      body: urlEncodedData
    });

    if (!submission_id.ok) {
      console.log(submission_id.json())
      throw new Error('You have to wait 1 minute and 30 seconds before submitting another code');
    }

    const data = await submission_id.json();
    //fetching the result of the submission
    let result = await fetch(process.env.CODEFUN_API_URL + `/submissions/${data.data}`, {
      method: 'GET',
      headers: {
          'Content-Type': 'application/json'
      }
    });
    result = await result.json();

    //if result.data.result is equal to Q retry the api call every 0.5 seconds
    while (result.data.result === 'Q') {
      await new Promise(resolve => setTimeout(resolve, 500));
      const submission = await fetch(process.env.CODEFUN_API_URL + `/submissions/${data.data}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
      });
      result = await submission.json();
    }
    // Creating Grade object
    const gradeObj = {
      userId: idtoken.user,
      scoreGiven: result.data.score,
      scoreMaximum: 100,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded'
    }

    // Selecting linetItem ID
    let lineItemId = idtoken.platformContext.endpoint.lineitem // Attempting to retrieve it from idtoken
    if (!lineItemId) {
      const response = await lti.Grade.getLineItems(idtoken, { resourceLinkId: true })
      const lineItems = response.lineItems
      if (lineItems.length === 0) {
        // Creating line item if there is none
        console.log('Creating new line item')
        const newLineItem = {
          scoreMaximum: 100,
          label: 'Grade',
          tag: 'grade',
          resourceLinkId: idtoken.platformContext.resource.id
        }
        const lineItem = await lti.Grade.createLineItem(idtoken, newLineItem)
        lineItemId = lineItem.id
      } else lineItemId = lineItems[0].id
    }
    // Sending Grade
    const responseGrade = await lti.Grade.submitScore(idtoken, lineItemId, gradeObj)
    return res.send(result.data)
  } catch (err) {
    console.log(err.message)
    return res.status(500).send( err.message )
  }
})

// Names and Roles route
router.get('/members', async (req, res) => {
  try {
    const result = await lti.NamesAndRoles.getMembers(res.locals.token)
    if (result) return res.send(result.members)
    return res.sendStatus(500)
  } catch (err) {
    console.log(err.message)
    return res.status(500).send(err.message)
  }
})

// Deep linking route
router.post('/deeplink', async (req, res) => {
  try {
    const resource = req.body
    //fetch to api to validate the problem id, if 4xx or 5xx return error
    const response = await fetch(process.env.CODEFUN_API_URL + `/problems/${resource.problem}`, {
      method: 'GET',
      headers: {
          'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Invalid Problem ID`);
    }

    const items = [{
      type: 'ltiResourceLink',
      title: resource.title,
      custom: {
        problem: resource.problem,
        language: resource.language
      }
    }]

    const form = await lti.DeepLinking.createDeepLinkingForm(res.locals.token, items, { message: 'Successfully Registered' })
    if (form) return res.send(form)
    return res.sendStatus(500)
  } catch (err) {
    console.log(err.message)
    return res.status(500).send(err.message)
  }
})

// Return available deep linking resources
router.get('/resources', async (req, res) => {
  const resources = [
    {
      name: 'Resource1',
      value: 'value1'
    },
    {
      name: 'Resource2',
      value: 'value2'
    },
    {
      name: 'Resource3',
      value: 'value3'
    }
  ]
  return res.send(resources)
})

// Get user and context information
router.get('/info', async (req, res) => {
  const token = res.locals.token
  const context = res.locals.context

  const info = { }
  if (token.userInfo) {
    if (token.userInfo.name) info.name = token.userInfo.name
    if (token.userInfo.email) info.email = token.userInfo.email
  }

  if (context.roles) info.roles = context.roles
  if (context.context) info.context = context.context

  return res.send(info)
})

// Wildcard route to deal with redirecting to React routes
router.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')))

module.exports = router
