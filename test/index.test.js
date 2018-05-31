/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const sinon = require('sinon');
const { base, orm } = require('feathers-service-tests');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const errors = require('@feathersjs/errors');
const feathers = require('@feathersjs/feathers');

const adapter = require('../lib');

const {
  User,
  Pet,
  Peeps,
  CustomPeeps,
  Post,
  TextPost
} = require('./models');

// hooks model
const callbackRemove = sinon.stub();
const callbackSave = sinon.stub();

const HooksSchema = new Schema({
  name: { type: String, required: true }
});

HooksSchema.pre('remove', callbackRemove);
HooksSchema.pre('save', callbackSave);

const Hooks = mongoose.model('Hooks', HooksSchema);

const _ids = {};
const _petIds = {};
const app = feathers()
  .use('/peeps', adapter({ Model: Peeps, events: [ 'testing' ] }))
  .use('/peeps-customid', adapter({
    id: 'customid',
    Model: CustomPeeps,
    events: [ 'testing' ]
  }))
  .use('/people', adapter({ Model: User, lean: false }))
  .use('/pets', adapter({ Model: Pet, lean: false }))
  .use('/people2', adapter({ Model: User }))
  .use('/pets2', adapter({ Model: Pet }))
  .use('/posts', adapter({ Model: Post, discriminators: [TextPost] }))
  .use('/hooks', adapter({ Model: Hooks}));
const people = app.service('people');
const pets = app.service('pets');
const leanPeople = app.service('people2');
const leanPets = app.service('pets2');
const posts = app.service('posts');
const hooks = app.service('hooks');

// Tell mongoose to use native promises
// See http://mongoosejs.com/docs/promises.html
mongoose.Promise = global.Promise;

// Connect to your MongoDB instance(s)
mongoose.connect('mongodb://localhost:27017/feathers');

describe('Feathers Mongoose Service', () => {
  describe('Requiring', () => {
    const lib = require('../lib');

    it('exposes the service as a default module', () => {
      expect(typeof lib).to.equal('function');
    });

    it('exposes the Service Constructor', () => {
      expect(typeof lib.Service).to.equal('function');
    });

    it('exposes hooks', () => {
      expect(typeof lib.hooks).to.equal('object');
    });
  });

  describe('Initialization', () => {
    describe('when missing options', () => {
      it('throws an error', () => {
        expect(adapter.bind(null)).to.throw('Mongoose options have to be provided');
      });
    });

    describe('when missing a Model', () => {
      it('throws an error', () => {
        expect(adapter.bind(null, { name: 'Test' })).to.throw(/You must provide a Mongoose Model/);
      });
    });

    describe('when missing the id option', () => {
      it('sets the default to be _id', () => {
        expect(people.id).to.equal('_id');
      });
    });

    describe('when missing the paginate option', () => {
      it('sets the default to be {}', () => {
        expect(people.paginate).to.deep.equal({});
      });
    });

    describe('when missing the overwrite option', () => {
      it('sets the default to be true', () => {
        expect(people.overwrite).to.be.true;
      });
    });

    describe('when missing the lean option', () => {
      it('sets the default to be false', () => {
        expect(people.lean).to.be.false;
      });
    });
  });

  describe('Common functionality', () => {
    beforeEach(() => {
      // FIXME (EK): This is shit. We should be loading fixtures
      // using the raw driver not our system under test
      return pets.create({type: 'dog', name: 'Rufus', gender: 'Unknown'}).then(pet => {
        _petIds.Rufus = pet._id;

        return people.create({
          name: 'Doug',
          age: 32,
          pets: [pet._id]
        }).then(user => {
          _ids.Doug = user._id;
        });
      });
    });

    afterEach(() => {
      return pets.remove(null, { query: {} }).then(() =>
        people.remove(null, { query: {} })
      );
    });

    it('can $select with a String', function (done) {
      var params = {
        query: {
          name: 'Rufus',
          $select: '+gender'
        }
      };

      pets.find(params).then(data => {
        expect(data[0].gender).to.equal('Unknown');
        done();
      });
    });

    it('can $select with an Array', function (done) {
      var params = {
        query: {
          name: 'Rufus',
          $select: ['gender']
        }
      };

      pets.find(params).then(data => {
        expect(data[0].gender).to.equal('Unknown');
        done();
      });
    });

    it('can $select with an Object', function (done) {
      var params = {
        query: {
          name: 'Rufus',
          $select: {'gender': true}
        }
      };

      pets.find(params).then(data => {
        expect(data[0].gender).to.equal('Unknown');
        done();
      });
    });

    it('can $populate with find', function (done) {
      var params = {
        query: {
          name: 'Doug',
          $populate: ['pets']
        }
      };

      people.find(params).then(data => {
        expect(data[0].pets[0].name).to.equal('Rufus');
        done();
      });
    });

    it('can $populate with get', function (done) {
      var params = {
        query: {
          $populate: ['pets']
        }
      };

      people.get(_ids.Doug, params).then(data => {
        expect(data.pets[0].name).to.equal('Rufus');
        done();
      }).catch(done);
    });

    it('can patch a mongoose model', function (done) {
      people.get(_ids.Doug).then(dougModel => {
        people.patch(_ids.Doug, dougModel).then(data => {
          expect(data.name).to.equal('Doug');
          done();
        }).catch(done);
      }).catch(done);
    });

    it('can patch a mongoose model', function (done) {
      people.get(_ids.Doug).then(dougModel => {
        people.update(_ids.Doug, dougModel).then(data => {
          expect(data.name).to.equal('Doug');
          done();
        }).catch(done);
      }).catch(done);
    });

    it('can upsert with patch', function (done) {
      var data = { name: 'Henry', age: 300 };
      var params = {
        mongoose: { upsert: true },
        query: { name: 'Henry' }
      };

      people.patch(null, data, params).then(data => {
        expect(Array.isArray(data)).to.equal(true);

        var henry = data[0];
        expect(henry.name).to.equal('Henry');
        done();
      }).catch(done);
    });

    it('can $populate with update', function (done) {
      var params = {
        query: {
          $populate: ['pets']
        }
      };

      people.get(_ids.Doug).then(doug => {
        var newDoug = doug.toObject();
        newDoug.name = 'Bob';

        people.update(_ids.Doug, newDoug, params).then(data => {
          expect(data.name).to.equal('Bob');
          expect(data.pets[0].name).to.equal('Rufus');
          done();
        }).catch(done);
      }).catch(done);
    });

    it('can $populate with patch', function (done) {
      var params = {
        query: {
          $populate: ['pets']
        }
      };

      people.patch(_ids.Doug, { name: 'Bob' }, params).then(data => {
        expect(data.name).to.equal('Bob');
        expect(data.pets[0].name).to.equal('Rufus');
        done();
      }).catch(done);
    });

    it('can $push an item onto an array with update', function (done) {
      pets.create({ type: 'cat', name: 'Margeaux' }).then(margeaux => {
        people.update(_ids.Doug, { $push: { pets: margeaux } })
          .then(() => {
            var params = {
              query: {
                $populate: ['pets']
              }
            };

            people.get(_ids.Doug, params).then(data => {
              expect(data.pets[1].name).to.equal('Margeaux');
              done();
            }).catch(done);
          }).catch(done);
      }).catch(done);
    });

    it('can $push an item onto an array with patch', function (done) {
      pets.create({ type: 'cat', name: 'Margeaux' }).then(margeaux => {
        people.patch(_ids.Doug, { $push: { pets: margeaux } })
          .then(() => {
            var params = {
              query: {
                $populate: ['pets']
              }
            };

            people.get(_ids.Doug, params).then(data => {
              expect(data.pets[1].name).to.equal('Margeaux');
              done();
            }).catch(done);
          }).catch(done);
      }).catch(done);
    });

    it('runs validators on update', function () {
      return people.create({ name: 'David', age: 33 })
        .then(person => people.update(person._id, { name: 'Dada', age: 'wrong' }))
        .then(() => {
          throw new Error('Update should not be successful');
        })
        .catch(error => {
          expect(error.name).to.equal('BadRequest');
          expect(error.message).to.equal('User validation failed: age: Cast to Number failed for value "wrong" at path "age"');
        });
    });

    it('runs validators on patch', function (done) {
      people.create({ name: 'David', age: 33 })
        .then(person => people.patch(person._id, { name: 'Dada', age: 'wrong' }))
        .then(() => done(new Error('Update should not be successful')))
        .catch(error => {
          expect(error.name).to.equal('BadRequest');
          expect(error.message).to.equal('Cast to number failed for value "wrong" at path "age"');
          done();
        });
    });

    it('returns a Conflict when unique index is violated', function (done) {
      pets.create({ type: 'cat', name: 'Bob' })
        .then(() => pets.create({ type: 'cat', name: 'Bob' }))
        .then(() => done(new Error('Should not be successful')))
        .catch(error => {
          expect(error.name).to.equal('Conflict');
          done();
        });
    });

    orm(leanPeople, errors, '_id');
  });

  describe('Lean Services', () => {
    beforeEach((done) => {
      // FIXME (EK): This is shit. We should be loading fixtures
      // using the raw driver not our system under test
      leanPets.create({type: 'dog', name: 'Rufus'}).then(pet => {
        _petIds.Rufus = pet._id;

        return leanPeople.create({ name: 'Doug', age: 32, pets: [pet._id] }).then(user => {
          _ids.Doug = user._id;
          done();
        });
      });
    });

    afterEach(done => {
      leanPets.remove(null, { query: {} }).then(() => {
        return leanPeople.remove(null, { query: {} }).then(() => {
          return done();
        });
      });
    });

    it('can $populate with find', function (done) {
      var params = {
        query: {
          name: 'Doug',
          $populate: ['pets']
        }
      };

      leanPeople.find(params).then(data => {
        expect(data[0].pets[0].name).to.equal('Rufus');
        done();
      });
    });

    it('can $populate with get', function (done) {
      var params = {
        query: {
          $populate: ['pets']
        }
      };

      leanPeople.get(_ids.Doug, params).then(data => {
        expect(data.pets[0].name).to.equal('Rufus');
        done();
      }).catch(done);
    });

    it('can upsert with patch', function (done) {
      var data = { name: 'Henry', age: 300 };
      var params = {
        mongoose: { upsert: true },
        query: { name: 'Henry' }
      };

      leanPeople.patch(null, data, params).then(data => {
        expect(Array.isArray(data)).to.equal(true);

        var henry = data[0];
        expect(henry.name).to.equal('Henry');
        done();
      }).catch(done);
    });
  });

  describe('Discriminators', () => {
    const data = {
      _type: 'text',
      text: 'Feathers!!!'
    };

    afterEach(done => {
      posts.remove(null, { query: {} })
        .then(data => {
          done();
        });
    });

    it('can get a discriminated model', function (done) {
      posts.create(data)
        .then(data => posts.get(data._id))
        .then(data => {
          expect(data._type).to.equal('text');
          expect(data.text).to.equal('Feathers!!!');
          done();
        });
    });

    it('can find discriminated models by the type', function (done) {
      posts.create(data)
        .then(data => posts.find({ query: { _type: 'text' } }))
        .then(data => {
          data.forEach(element => {
            expect(element._type).to.equal('text');
          });
          done();
        });
    });

    it('can create a discriminated model', function (done) {
      posts.create(data)
        .then(data => {
          expect(data._type).to.equal('text');
          expect(data.text).to.equal('Feathers!!!');
          done();
        });
    });

    it('can update a discriminated model', function (done) {
      const update = {
        _type: 'text',
        text: 'Hello, world!',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const params = {
        query: {
          _type: 'text'
        }
      };
      posts.create(data)
        .then(data => posts.update(data._id, update, params))
        .then(data => {
          expect(data._type).to.equal('text');
          expect(data.text).to.equal('Hello, world!');
          done();
        });
    });

    it('can patch a discriminated model', function (done) {
      const update = {
        text: 'Howdy folks!'
      };
      const params = {
        query: {
          _type: 'text'
        }
      };
      posts.create(data)
        .then(data => posts.patch(data._id, update, params))
        .then(data => {
          expect(data.text).to.equal('Howdy folks!');
          done();
        });
    });

    it('can remove a discriminated model', function (done) {
      posts.create(data)
        .then(data => posts.remove(data._id, { query: { _type: 'text' } }))
        .then(data => {
          expect(data._type).to.equal('text');
          done();
        });
    });
  });

  describe('Common tests', () => {
    before(() => Promise.all([
      app.service('peeps').remove(null),
      app.service('peeps-customid').remove(null)
    ]));

    base(app, errors, 'peeps', '_id');
    base(app, errors, 'peeps-customid', 'customid');
  });

  describe('Mongoose hooks', () => {
    const data = {
      name: 'Feathers!!!'
    };

    it('calls mongoose pre save hook when creating document', (done) => {
      hooks.create(data)
        .then(() => {
          expect(callbackSave).to.be.calledOnce
          done()
        })
    })

    it('calls mongoose pre remove hook when removing document', (done) => {
      hooks.create(data)
        .then(hook => hooks.remove(hook._id))
        .then(() => {
          expect(callbackRemove).to.be.calledOnce
          done()
        })
    })

  });
});
