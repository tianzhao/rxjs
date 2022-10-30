const githubUsers = `https://api.github.com/users?per_page=2`;

const users = ajax(githubUsers);

const subscribe = users.subscribe(
  res => console.log(res),
  err => console.error(err)
);

/* output
{  
  "originalEvent":{  
    "isTrusted":true
  },
  "xhr":{  

  },
  "request":{  
    "async":true,
    "crossDomain":true,
    "withCredentials":false,
    "headers":{  

    },
    "method":"GET",
    "responseType":"json",
    "timeout":0,
    "url":"https://api.github.com/users?per_page=2"
  },
  "status":200,
  "responseType":"json",
  "response":[  
    {  
      "login":"mojombo",
      "id":1,
      "node_id":"MDQ6VXNlcjE=",
      "avatar_url":"https://avatars0.githubusercontent.com/u/1?v=4",
      "gravatar_id":"",
      ...
    },
    {  
      "login":"defunkt",
      "id":2,
      "node_id":"MDQ6VXNlcjI=",
      "avatar_url":"https://avatars0.githubusercontent.com/u/2?v=4",
      "gravatar_id":"",
      "...
    }
  ]
}
*/
