'use strict';
/////////////////////////////////////////////////////////////////////////////////////
///////////////                  Imports                   /////////////////////////
///////////////////////////////////////////////////////////////////////////////////
/*Importing Mocha, Chai, Faker (Testing stuff) */
const chai = require('chai');
const chaiHttp = require('chai-http');
const should = chai.should();
const faker = require('faker');

/*Database Import */
const mongoose = require('mongoose');

/*Server Import*/
const{closeServer, runServer, app} = require('../server');

/*Model Import */
const{ChatRoom, User} = require('../models/chatroom');

/*Mlab URL that stores our database */
const {TEST_DATABASE_URL} = require('../config');

/*Apply chaiHttp to all our tests such that we can 
simulate a request-response cycle */
chai.use(chaiHttp);

/////////////////////////////////////////////////////////////////////////////////////
///////////////    Creating dummy values and destroying Database    ////////////////
///////////////////////////////////////////////////////////////////////////////////
/*Destroying the Database */
function tearDownDb() {
  return new Promise((resolve, reject) => {
    console.warn('Deleting database');
    mongoose.connection.dropDatabase()
              .then(result => resolve(result))
              .catch(err => reject(err));
  });
}

/*Creating a dummy User */
const USER = {
  username: faker.internet.userName(),
  password: 'password',
  firstName: faker.name.firstName(),
  lastName: faker.name.lastName(),
  email: faker.internet.email(),
  chatroomId:[]
};

/*Seeding the user into the test database */
function seedUser(){
  const newUser = {
    username: USER.username,
    firstName: USER.firstName,
    lastName: USER.lastName,
    chatroomId: USER.chatroomId,
    email: USER.email
  };
  return User.hashPassword(USER.password)
    .then(hash => {
      newUser.password = hash;
      return User.create(newUser);
    });
}

/*Creating and Seeding dummy chatrooms in the test database*/
function seedChatroom(){
  const seedData = [];
  for (let i =1; i <= 10; i++){
    seedData.push({
      users: [{username: faker.internet.userName()}],
      messages: {
        message: faker.lorem.sentence()
      },
      title: faker.lorem.words(),
      category: faker.lorem.words()
    });
  }
  return ChatRoom.insertMany(seedData);
}

/////////////////////////////////////////////////////////////////////////////////////
///////////////              Sending static file test               ////////////////
///////////////////////////////////////////////////////////////////////////////////
/*Test that tests if index.html is sent to client*/
describe('Testing root endpoint',function(){
  it('should verify you hit root url', function(){
    return chai.request(app)
      .get('/')
      .then(res => {
        res.should.be.status(200);
      });
  });
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////         Chatroom Tests Get Put Post Delete          ////////////////
///////////////////////////////////////////////////////////////////////////////////
describe('ChatRoom API resource', function(){

  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return Promise.all([seedUser(), seedChatroom()]);
  });

  afterEach(function() {
    // tear down database so we ensure no state from this test
    // effects any coming after.
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });

  describe('Get endpoint for chatroom', function(){
    it('should return all exisitng chatrooms', function(){
      let res;
      return chai
      .request(app)
      .get('/chatrooms')
      .then(_res => {
        res = _res;
        res.should.be.status(200);
        res.body.length.should.be.at.least(1);
        return ChatRoom
        .find()
        .count()
        .exec();
      })
      .then(count => {
        res.body.should.have.lengthOf(count);
      });
    });

    it('should return chats with the correct fields', function(){
      let resChat;
      return chai
      .request(app)
      .get('/chatrooms')
      .then(function(res) {
        res.should.be.status(200);
        res.should.be.json;
        res.body.should.be.a('array');
        res.body.length.should.be.at.least(1);
        res.body.forEach(function(chat) {
          chat.should.be.a('object');
          chat.should.include.key('id', 'users', 'messages', 'title', 'category');
        });
        resChat = res.body[0];
        return ChatRoom
        .findById(resChat.id)
        .exec();
      })
      .then(function(chat) {
        resChat.users[0].username.should.equal(chat.users[0].username);
        resChat.messages[0].message.should.equal(chat.messages[0].message);
        resChat.title.should.equal(chat.title);
        resChat.category.should.equal(chat.category);
      });
    });

    it('should return distinct categories for chatrooms', function(){
      let resChat;
      return chai
      .request(app)
      .get('/chatrooms/distinct')
      .then(function(res) {
        res.should.be.status(200);
        res.body.should.be.a('array')
        res.body.length.should.be.at.least(1);
        resChat = res.body;
        return ChatRoom
        .distinct("category")
        .exec()
      })
      .then(chat => {
      resChat.should.deep.equal(chat);
      });
    });
  });
  describe('Post endpoint for chatroom', function(){
    it('posted object should be in database', function(){
      let resChat;
      const newChat = {
        title:'kagami',
        category: 'anime'
      };
      return chai
      .request(app)
      .post('/chatrooms')
      .auth(USER.username, USER.password)
      .send(newChat)
      .then(function(res){
        res.should.be.status(201);
        res.body.should.be.a('object');
        res.body.should.include.keys(['title','category','users','messages']);
        res.body.users.should.have.lengthOf(0);
        res.body.messages.should.have.lengthOf(0);
        res.body.id.should.not.be.null;
        res.body.category.should.equal(newChat.category);
        res.body.title.should.equal(newChat.title);
        resChat = res.body;
        return ChatRoom
        .findById(res.body.id)
        .exec();
      })
      .then(function(chat){
        chat.id.should.equal(resChat.id);
        chat.title.should.equal(resChat.title);
        chat.category.should.equal(resChat.category);
        chat.users.should.have.lengthOf(0);
        chat.messages.should.have.lengthOf(0);
      });
    });

    it('should reject creating chatroom with no credentials', function(){
      const newChat = {
        title:'kagami',
        category: 'anime'
      };
      return chai.request(app)
          .post('/chatrooms')
          .send(newChat)
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject creating chatroom with wrong username', function(){
      const newChat = {
        title:'kagami',
        category: 'anime'
      };
      return chai.request(app)
          .post('/chatrooms')
          .auth(faker.internet.userName(), USER.password)
          .send(newChat)
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject creating chatroom with wrong password', function(){
      const newChat = {
        title:'kagami',
        category: 'anime'
      };
      return chai.request(app)
          .post('/chatrooms')
          .auth(USER.username, faker.lorem.words())
          .send(newChat)
          .catch(function(res) {
            res.should.have.status(401);
          });
    });
  });
  describe('Put endpoint for chatroom',function(){
    it('should update title and category',function(){
      let chatRes;
      const updateChat ={
        title:'wassup',
        category:'greeting'
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateChat.id = resultChat.id;
        return chai
        .request(app)
        .put(`/chatrooms/${resultChat.id}`)
        .auth(USER.username, USER.password)
        .send(updateChat);
      })
      .then(function(res){
        res.should.be.json;
        res.should.be.a('object');
        res.should.be.status(201);
        res.body.should.include.keys(['id','title','category','messages','users']);
        res.body.id.should.equal(updateChat.id);
        res.body.id.should.not.be.null;
        res.body.title.should.equal(updateChat.title);
        res.body.category.should.equal(updateChat.category);
        chatRes = res.body;
        return ChatRoom
        .findById(res.body.id)
        .exec();
      })
      .then(function(chat){
        chat.id.should.equal(chatRes.id);
        chat.title.should.equal(chatRes.title);
        chat.category.should.equal(chatRes.category);
      });

    });
    it('should update users and messages',function(){
      let chatRes;
      const updateObj ={
        users:[{username:USER.username},{username:'wassup101'}],
        messages:{
          message:'lol',
          id:6
        }
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateObj.id = resultChat.id;
        return chai
        .request(app)
        .put(`/chatrooms/${resultChat.id}`)
        .auth(USER.username, USER.password)
        .send(updateObj);
      })
      .then(function(res){
        res.should.be.json;
        res.should.be.a('object');
        res.should.be.status(201);
        res.body.should.include.keys(['id','title','category','messages','users']);
        res.body.id.should.not.be.null;
        res.body.id.should.equal(updateObj.id);
        res.body.users.should.have.lengthOf(2);
        for(let i =0;i<res.body.users.length;i++){
          res.body.users[i].username.should.be.equal(updateObj.users[i].username);
        }
        res.body.messages[0].message.should.have.lengthOf(3);
        res.body.messages[0].id.should.equal(updateObj.messages.id);
        chatRes = res.body;
        return ChatRoom
        .findById(res.body.id)
        .exec();
      })
      .then(function(chat){
        chat.id.should.equal(chatRes.id);
        chat.title.should.equal(chatRes.title);
        chat.category.should.equal(chatRes.category);
        chat.users.should.have.lengthOf(2);
        for(let i =0;i<chat.users.length;i++){
          chat.users[i].username.should.be.equal(chatRes.users[i].username);
        }
        chat.messages[0].message.should.have.lengthOf(3);
        chat.messages[0].id.should.deep.equal(chatRes.messages[0].id);
      });
    });

    it('should reject updating title & category with no credentials', function(){
      const updateChat = {
        title:'kagami',
        category: 'anime'
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateChat.id = resultChat.id;
      return chai.request(app)
          .put(`/chatrooms/${resultChat.id}`)
          .send(updateChat)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject updating title & category with wrong username', function(){
      const updateChat = {
        title:'kagami',
        category: 'anime'
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateChat.id = resultChat.id;
      return chai.request(app)
          .put(`/chatrooms/${resultChat.id}`)
          .auth(faker.internet.userName(), USER.password)
          .send(updateChat)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject updating title & category with wrong password', function(){
      const updateChat = {
        title:'kagami',
        category: 'anime'
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateChat.id = resultChat.id;
      return chai.request(app)
          .put(`/chatrooms/${resultChat.id}`)
          .auth(USER.username, faker.lorem.words())
          .send(updateChat)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject updating messages & users with no credentials', function(){
      const updateObj ={
        users:[{username:USER.username},{username:'wassup101'}],
        messages:{
          message:'lol',
          id:6
        }
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateObj.id = resultChat.id;
      return chai.request(app)
          .put(`/chatrooms/${resultChat.id}`)
          .send(updateObj)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject updating messages & users with wrong username', function(){
      const updateObj ={
        users:[{username:USER.username},{username:'wassup101'}],
        messages:{
          message:'lol',
          id:6
        }
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateObj.id = resultChat.id;
      return chai.request(app)
          .put(`/chatrooms/${resultChat.id}`)
          .auth(faker.internet.userName(), USER.password)
          .send(updateObj)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject updating messages & users with wrong password', function(){
      const updateObj ={
        users:[{username:USER.username},{username:'wassup101'}],
        messages:{
          message:'lol',
          id:6
        }
      };
      return ChatRoom
      .findOne()
      .exec()
      .then(function(resultChat){
        updateObj.id = resultChat.id;
      return chai.request(app)
          .put(`/chatrooms/${resultChat.id}`)
          .auth(USER.username, faker.lorem.words())
          .send(updateObj)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

  });
  describe('Delete endpoint for chatroom',function(){
    it('should delete a post by id',function(){
      let chatroom;
      return ChatRoom
      .findOne()
      .exec()
      .then(function(chat){
        chatroom = chat;
        return chai
        .request(app)
        .delete(`/chatrooms/${chat.id}`)
        .auth(USER.username, USER.password)
      })
      .then(function(res){
        res.should.have.status(204);
        return ChatRoom
        .findById(chatroom.id)
        .exec();
      })
      .then(function(deleted){
        should.not.exist(deleted);
      });
    });

    it('should reject deleting chatroom with no credentials', function(){
      let chatroom;
      return ChatRoom
      .findOne()
      .exec()
      .then(function(chat){
        chatroom = chat;
      return chai.request(app)
          .delete(`/chatrooms/${chat.id}`)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject deleting chatroom with wrong username', function(){
      let chatroom;
      return ChatRoom
      .findOne()
      .exec()
      .then(function(chat){
        chatroom = chat;
      return chai.request(app)
          .delete(`/chatrooms/${chat.id}`)
          .auth(faker.internet.userName(), USER.password)
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });

    it('should reject creating chatroom with wrong password', function(){
      let chatroom;
      return ChatRoom
      .findOne()
      .exec()
      .then(function(chat){
        chatroom = chat;
      return chai.request(app)
          .delete(`/chatrooms/${chat.id}`)
          .auth(USER.username, faker.lorem.words())
        })
          .catch(function(res) {
            res.should.have.status(401);
          });
    });
  });
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////               User Tests Get Post                   ////////////////
///////////////////////////////////////////////////////////////////////////////////
describe('Users API resource', function(){

  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedUser();
  });

  afterEach(function() {
    // tear down database so we ensure no state from this test
    // effects any coming after.
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });
  describe('Get endpoint for users',function(){
    it('get all users',function(){
      let userResArr;
      return chai
      .request(app)
      .get('/users')
      .then(function(res){
        res.should.be.json;
        res.should.be.status(200);
        res.body.should.have.length.of.at.least(1);
        res.body.should.be.a('array');
        res.body[0].should.be.a('object');
        userResArr = res.body;
        return User
        .find()
        .count()
        .exec();
      })
      .then(function(count){
        userResArr.should.have.lengthOf(count);
      });
    });

    it('should get the right fields',function(){
      let userRes;
      return chai
      .request(app)
      .get('/users')
      .then(function(res){
        res.should.be.status(200);
        res.should.be.json;
        res.body.should.be.a('array');
        res.body[0].should.be.a('object');
        res.body[0].should.include.keys(['username','fullName','email','ownChatRoom']);
        res.body[0].username.should.not.be.null;
        res.body[0].email.should.not.be.null;
        userRes = res.body[0];
        return User
        .find({username:res.body[0].username})
        .exec();
      })
      .then(function(user){
        user[0].username.should.equal(userRes.username);
        userRes.fullName.should.equal(`${user[0].firstName} ${user[0].lastName}`.trim());
        user[0].email.should.equal(userRes.email);
        for(let i = 0; i < user[0].chatroomId.length;i++){
          user[0].chatroomId[i].should.equal(userRes.ownChatRoom[i]);
        }
      });
    });
  });
  describe('Post endpoint for users',function(){
    it('should add a user',function(){
      let userRes;
      const newUser ={
        username:'kek',
        password:'life',
        email:'kek@gmail.com',
        firstName: 'Sen',
        lastName: 'Mikimoto',
      };
      return chai
      .request(app)
      .post('/users')
      .send(newUser)
      .then(function(res){
        res.should.be.json;
        res.should.be.status(201);
        res.body.should.be.a('object');
        res.body.should.include.keys(['username','fullName','email','ownChatRoom']);
        res.body.username.should.equal(newUser.username);
        res.body.fullName.should.equal(`${newUser.firstName} ${newUser.lastName}`.trim());
        res.body.email.should.equal(newUser.email);
        res.body.ownChatRoom.should.have.lengthOf(0);
        return User
        .findOne({username:res.body.username})
        .exec();
      })
      .then(function(dataRes){
        dataRes.username.should.equal(newUser.username);
        dataRes.lastName.should.equal(newUser.lastName);
        dataRes.firstName.should.equal(newUser.firstName);
        return dataRes.validatePassword(newUser.password);
      })
      .then(function(res){
        res.should.equal(true);
      });
    });
  });
});
