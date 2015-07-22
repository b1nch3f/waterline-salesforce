![image_squidhome@2x.png](http://i.imgur.com/RIvu9.png)

# Salesforce

Waterline adapter for salesforce.com.

This is a rough implementation, so PRs are welcome. We're using it on several of
our projects, and we'll be making fixes and updates as needed, but raising
issues will help us harden this implementation.

## Installation

Install from NPM.

```bash
$ npm install waterline-salesforce --save
```

## Waterline Configuration

Add the salesforce config to the `config/adapters.js` file.

### Using with Waterline v0.10.x

```javascript
var config = {
  adapters: {
    salesforce: salesforceAdapter
  },
  connections: {
    salesforce: {
      adapter: 'salesforce',
      connectionParams: {
        loginUrl: 'https://test.salesforce.com'
      },
      username: '{{username}}',
      password: '{{password}}{{accessToken}}'
    }
  }
};

waterline.initialize(config, function (err, ontology) {

});
```
