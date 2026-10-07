export default function About() {
  return (
    <section className="section">
      <div className="wrap prose">
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            letterSpacing: '0.03em',
            color: 'var(--navy)',
            margin: '0 0 22px',
          }}
        >
          About Campus Customs
        </h1>
        <p>
          We are a Yale apparel shop at 57 Broadway in New Haven, one street over from Old Campus.
          We opened in 1975 and we have been selling officially licensed Yale merchandise from
          this block ever since, which makes us the oldest licensed Yale retailer in the city.
        </p>

        <div className="facts">
          <div className="fact">
            <b>1975</b>
            <span>Selling Yale gear on Broadway ever since</span>
          </div>
          <div className="fact">
            <b>57 Broadway</b>
            <span>New Haven, CT 06511</span>
          </div>
          <div className="fact">
            <b>On site</b>
            <span>Our own screen printing plant behind the store</span>
          </div>
          <div className="fact">
            <b>Licensed</b>
            <span>Every item approved by Yale University</span>
          </div>
        </div>

        <h2>How we got here</h2>
        <p>
          The business started as a single storefront and grew into three of them on the same
          block, including the Boola Boola Shop. In the nineties we added screen printing, which
          changed what we were: not just a store that ordered shirts, but a shop that made them.
        </p>
        <p>
          When the York Square Cinema next door closed in 2005, we spent the better part of two
          years turning an old movie theater into a printing plant and a bigger, brighter store.
          The press room is still back there. If you buy a shirt here, there is a good chance it
          was printed about thirty feet from the register.
        </p>

        <h2>What we sell</h2>
        <p>
          Yale apparel, mostly. T-shirts, crewnecks, hoodies, quarter-zips and jackets, in sizes
          XS through XXL. Residential college gear for Branford, Davenport, Benjamin Franklin and
          the rest. Team shirts. Harvard-Yale shirts, in the years when they are worth printing.
        </p>
        <p>
          We do not carry everything, and we would rather tell you that than sell you something
          close enough. If a size is out, the site says it is out.
        </p>

        <h2>The chat assistant</h2>
        <p>
          The assistant in the corner of this site is connected to the same catalogue and the same
          inventory counts the store runs on. It can tell you what we carry, what it costs and
          what is left in your size. It will not invent a product we do not stock or guess at a
          price, which is the whole point of wiring it to the database instead of letting it talk
          from memory.
        </p>

        <h2>Come by</h2>
        <p>
          57 Broadway, New Haven. We are easy to find: walk up Broadway from Old Campus and look
          for the blue awning. If you are shopping for a graduation, a reunion or a kid who just
          got in, say so when you come in and we will help you figure it out.
        </p>
      </div>
    </section>
  )
}
