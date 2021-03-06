import Organisation from './organisation';

/**
 * Controller class for the Organisation model.
 * @private
 */
export default class OrganisationController {
  /**
   * @param {Connection} connection - Object to use for making a connection to the REST API and Websocket server.
   */
  constructor(connection) {
    /**
     * Object to use for making a connection to the REST API and Websocket server.
     * @type {Connection}
     */
    this._connection = connection;
  }

  /**
   * Create an organisation. The organisation will be owned by the current active tenant.
   *
   * @param {Organisation} organisation - Object to create.
   * @returns {Promise.<Organisation>} Promise containing the newly created Organisation.
   * @throws {Promise.<Error>} organisation parameter of type "Organisation" is required.
   * @throws {Promise.<Error>} If the server returned an error.
   */
  createOrganisation(organisation) {
    if (!(organisation instanceof Organisation)) {
      return Promise.reject(new Error('organisation parameter of type "Organisation" is required'));
    }
    const url = this._connection._settings.apiUrl + '/organisations';
    const fd = JSON.stringify(organisation);

    return this._connection._secureAjaxPost(url, fd)
      .then(data => {
        const result = new Organisation(data.id, data.name);
        result.created = new Date(data.created);
        result.updated = new Date(data.updated);
        return result;
      });
  }

  /**
   * Get an organisation the current tenant is the owner of.
   *
   * @param {string} organisationId - Specify an organisation identifier.
   * @returns {Promise.<Organisation>} Promise containing an Organisation.
   * @throws {Promise.<Error>} organisationId parameter of type "string" is required.
   * @throws {Promise.<Error>} If no result could not be found.
   */
  getOrganisation(organisationId) {
    if (typeof organisationId !== 'string') {
      return Promise.reject(new Error('organisationId parameter of type "string" is required'));
    }
    const url = this._connection._settings.apiUrl + '/organisations/' + organisationId;

    return this._connection._secureAjaxGet(url)
      .then(data => {
        const organisation = new Organisation(data.id, data.name);
        organisation.created = new Date(data.created);
        organisation.updated = new Date(data.updated);
        return organisation;
      });
  }

  /**
   * Get and return all organisations the current tenant is the owner of.
   *
   * @returns {Promise.<Organisation[]>} Promise containing an array of Organisations.
   * @throws {Promise.<Error>} If no result could not be found.
   */
  getOrganisations() {
    const url = this._connection._settings.apiUrl + '/organisations';

    return this._connection._secureAjaxGet(url)
      .then(data => data.map(datum => {
        const organisation = new Organisation(datum.id, datum.name);
        organisation.created = new Date(datum.created);
        organisation.updated = new Date(datum.updated);
        return organisation;
      }));
  }
}
