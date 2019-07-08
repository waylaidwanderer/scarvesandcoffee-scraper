const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const rootUrl = 'http://scarvesandcoffee.net/browse.php?type=titles';

main();

async function main() {
    const output = await fetchStoriesMetadata();
    fs.writeFileSync('./metadata.json', JSON.stringify(output));
}

async function fetchStoriesMetadata(offset = 0, output = []) {
    const url = `${rootUrl}&offset=${offset}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const stories = $('#mainpage').find('.listbox');
    if (stories.length === 0) {
        return output;
    }
    stories.each(function() {
        const data = {};

        const title = $(this).find('.title');
        const storyUrlHref = title.find('a').first().attr('href');
        const urlMatches = /(.*)viewstory\.php\?sid=(\d+)(.*)/.exec(storyUrlHref);
        data.id = parseInt(urlMatches[2]);

        const titleText = title.text();
        const titleMatches = /(.*) by (.*) (Rated: (.*)) \[Reviews - (.*)\]/.exec(titleText);

        data.title = titleMatches[1];
        data.author = titleMatches[2];
        data.rating = titleMatches[4].trim();
        data.reviews = parseInt(titleMatches[5]);
        data.summary = $(this).find('.content').html();

        const tail = $(this).find('.tail').text().trim();
        const tailMatches = /(.*)Published: (.*) Updated: (.*)/.exec(tail);
        data.published_date = tailMatches[2];
        data.updated_date = tailMatches[3];

        output.push(data);
    });
    console.log(`${output.length} total stories fetched.`);
    return fetchStoriesMetadata(offset + 50, output);
}
