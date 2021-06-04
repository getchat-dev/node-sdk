const rightsScheme = require('./rights.scheme.json');

module.exports = function(rights = {})
{
    const keys = Object.keys(rights);

    if(keys.length) {
        const data = {};

        keys.forEach(key => {
            const value = rights[key];

            if(rightsScheme[key]) {
                if(rightsScheme[key]['type'] === 'boolean') {
                    data[key] = ['1', 'on', 'true', 'yes'].indexOf(String(value).toLowerCase()) > -1
                        ? '1'
                        : '0';
                }
                else if(rightsScheme[key]['type'] === 'enum' && rightsScheme[key]['values'].indexOf(value) > -1) {
                    data[key] = value
                }
            }

        });

        return Object.keys(data).length ? data : null;
    }

    return null;
}